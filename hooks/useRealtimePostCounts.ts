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
import { api } from '@/lib/api'
import { POST_METRICS_EVENT, syncPostMetricsAcrossCaches, type PostMetricsPatch } from '@/lib/postMetrics'
import type { PostCommentPreview } from '@/types'

interface LiveCounts {
  reaction_count?: number
  comment_count?: number
  reaction_counts?: Record<string, number>
  latest_comment?: PostCommentPreview | null
  user_reaction?: string | null
}

interface UseRealtimePostCountsOptions {
  fallbackPollMs?: number
}

function applyPatch(prev: LiveCounts, patch: PostMetricsPatch): LiveCounts {
  const reactionCounts = patch.reaction_counts
    ? {
        interesting: 0,
        funny: 0,
        deep: 0,
        curious: 0,
        ...patch.reaction_counts,
      }
    : patch.reaction_delta
      ? (() => {
          const counts = {
            interesting: 0,
            funny: 0,
            deep: 0,
            curious: 0,
            ...(prev.reaction_counts || {}),
          } as Record<string, number>
          if (patch.reaction_delta.remove) {
            counts[patch.reaction_delta.remove] = Math.max(0, (counts[patch.reaction_delta.remove] || 0) - 1)
          }
          if (patch.reaction_delta.add) {
            counts[patch.reaction_delta.add] = (counts[patch.reaction_delta.add] || 0) + 1
          }
          return counts
        })()
      : prev.reaction_counts

  const reactionCount = typeof patch.reaction_count === 'number'
    ? patch.reaction_count
    : reactionCounts
      ? Object.values(reactionCounts).reduce((sum, value) => sum + value, 0)
      : prev.reaction_count

  return {
    ...prev,
    ...(reactionCounts ? { reaction_counts: reactionCounts } : {}),
    ...(typeof reactionCount === 'number' ? { reaction_count: reactionCount } : {}),
    ...(typeof patch.comment_count === 'number'
      ? { comment_count: patch.comment_count }
      : typeof patch.comment_delta === 'number'
        ? { comment_count: Math.max(0, (prev.comment_count || 0) + patch.comment_delta) }
        : {}),
    ...(patch.latest_comment !== undefined ? { latest_comment: patch.latest_comment } : {}),
    ...(patch.user_reaction !== undefined ? { user_reaction: patch.user_reaction } : {}),
  }
}

export function useRealtimePostCounts(
  postId: string,
  initial: LiveCounts = {},
  options: UseRealtimePostCountsOptions = {}
) {
  const [counts, setCounts] = useState<LiveCounts>(initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { fallbackPollMs = 10000 } = options

  useEffect(() => {
    setCounts(initial)
  }, [postId])

  useEffect(() => {
    if (!postId) return

    // Debounced refetch: when a reaction/comment change fires, fetch fresh counts from API
    async function refresh() {
      try {
        const response = await api.get<{ data?: any }>(`/api/posts/${postId}`)
        const post = response?.data
        if (!post) return

        const patch: PostMetricsPatch = {
          reaction_counts: post.reaction_counts || undefined,
          reaction_count: post.reaction_counts
            ? Object.values(post.reaction_counts).reduce((sum: number, value: any) => sum + Number(value || 0), 0)
            : undefined,
          comment_count: typeof post.comment_count === 'number' ? post.comment_count : 0,
          latest_comment: post.latest_comment ?? null,
          user_reaction: post.user_reaction ?? null,
        }

        setCounts((prev) => applyPatch(prev, patch))
        syncPostMetricsAcrossCaches(postId, patch)
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

    const handleMetrics = (event: Event) => {
      const detail = (event as CustomEvent<{ postId: string; patch: PostMetricsPatch }>).detail
      if (!detail || detail.postId !== postId) return
      setCounts((prev) => applyPatch(prev, detail.patch))
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
      }, () => {
        debouncedRefresh()
      })
      .subscribe()

    window.addEventListener(POST_METRICS_EVENT, handleMetrics as EventListener)

    const intervalId = fallbackPollMs > 0
      ? window.setInterval(() => {
          if (document.hidden || !navigator.onLine) return
          void refresh()
        }, fallbackPollMs)
      : null

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (intervalId) window.clearInterval(intervalId)
      window.removeEventListener(POST_METRICS_EVENT, handleMetrics as EventListener)
      supabase.removeChannel(channel)
    }
  }, [fallbackPollMs, postId])

  return counts
}
