'use client'

/**
 * useRealtimePostCounts
 *
 * Subscribes to realtime changes for a specific post's reactions and comments.
 * Listens to BOTH:
 * - reactions table (INSERT/UPDATE/DELETE) for reaction count changes
 * - comments table (INSERT/DELETE) for comment count changes
 *
 * Returns live counts that override stale SWR data.
 * Used in FeedCard so counts update without full refetch.
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface LiveCounts {
  reaction_count?: number
  comment_count?: number
  reaction_counts?: Record<string, number>
}

export function useRealtimePostCounts(postId: string, initial: LiveCounts = {}) {
  const [counts, setCounts] = useState<LiveCounts>(initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!postId) return

    // Debounced refetch: when a reaction/comment change fires, fetch fresh counts from API
    function debouncedRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          // Fetch fresh reaction counts for this post
          const { data: reactions } = await supabase
            .from('reactions')
            .select('type')
            .eq('post_id', postId)

          if (reactions) {
            const rc: Record<string, number> = { interesting: 0, funny: 0, deep: 0, curious: 0 }
            reactions.forEach((r: any) => {
              if (r.type in rc) rc[r.type]++
            })
            const total = Object.values(rc).reduce((a, b) => a + b, 0)
            setCounts(prev => ({ ...prev, reaction_count: total, reaction_counts: rc }))
          }

          // Fetch fresh comment count
          const { count } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', postId)
            .eq('is_deleted', false)

          if (count !== null) {
            setCounts(prev => ({ ...prev, comment_count: count }))
          }
        } catch {
          // Silently fail — stale count is better than no count
        }
      }, 500) // 500ms debounce to batch rapid changes
    }

    const channel = supabase
      .channel(`post-counts:${postId}`)
      // Listen to reactions table changes for this post
      .on('postgres_changes', {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'reactions',
        filter: `post_id=eq.${postId}`,
      }, () => {
        debouncedRefresh()
      })
      // Listen to comments table changes for this post
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`,
      }, () => {
        debouncedRefresh()
      })
      // Also listen to posts table UPDATE (for DB trigger-based counter updates)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
        filter: `id=eq.${postId}`,
      }, (payload) => {
        const p = payload.new as any
        if (p.reaction_count !== undefined || p.comment_count !== undefined) {
          setCounts(prev => ({
            ...prev,
            ...(p.reaction_count !== undefined ? { reaction_count: p.reaction_count } : {}),
            ...(p.comment_count !== undefined ? { comment_count: p.comment_count } : {}),
          }))
        }
      })
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [postId])

  return counts
}
