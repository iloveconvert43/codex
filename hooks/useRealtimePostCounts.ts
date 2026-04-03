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
import type { PostCommentPreview } from '@/types'

interface LiveCounts {
  reaction_count?: number
  comment_count?: number
  reaction_counts?: Record<string, number>
  latest_comment?: PostCommentPreview | null
}

export function useRealtimePostCounts(postId: string, initial: LiveCounts = {}) {
  const [counts, setCounts] = useState<LiveCounts>(initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCounts(initial)
  }, [initial.comment_count, initial.latest_comment, initial.reaction_count, initial.reaction_counts])

  useEffect(() => {
    if (!postId) return

    // Debounced refetch: when a reaction/comment change fires, fetch fresh counts from API
    async function refresh() {
      try {
        const [
          { data: reactions },
          { count },
          { data: latestRows },
        ] = await Promise.all([
          supabase
            .from('reactions')
            .select('type')
            .eq('post_id', postId),
          supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', postId)
            .eq('is_deleted', false),
          supabase
            .from('comments')
            .select('id, post_id, user_id, parent_id, content, created_at, is_anonymous')
            .eq('post_id', postId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1),
        ])

        const rc: Record<string, number> = { interesting: 0, funny: 0, deep: 0, curious: 0 }
        ;(reactions || []).forEach((reaction: any) => {
          if (reaction.type in rc) rc[reaction.type]++
        })

        const latest = latestRows?.[0] || null
        let latestComment: PostCommentPreview | null = latest
          ? {
              id: latest.id,
              post_id: latest.post_id,
              user_id: latest.user_id,
              parent_id: latest.parent_id,
              content: latest.content,
              created_at: latest.created_at,
              is_anonymous: latest.is_anonymous,
              user: null,
            }
          : null

        if (latestComment && !latestComment.is_anonymous && latestComment.user_id) {
          const { data: user } = await supabase
            .from('users')
            .select('id, username, display_name, avatar_url, is_verified')
            .eq('id', latestComment.user_id)
            .maybeSingle()

          latestComment = {
            ...latestComment,
            user: user || null,
          }
        }

        setCounts((prev) => ({
          ...prev,
          reaction_count: Object.values(rc).reduce((sum, value) => sum + value, 0),
          reaction_counts: rc,
          comment_count: count ?? 0,
          latest_comment: latestComment,
        }))
      } catch {
        // Silently fail — stale count is better than no count
      }
    }

    function debouncedRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void refresh()
      }, 250)
    }

    void refresh()

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
      }, () => {
        debouncedRefresh()
      })
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [postId])

  return counts
}
