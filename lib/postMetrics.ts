import { mutate } from 'swr'
import { useFeedStore } from '@/store/feedStore'
import type { Comment, PostCommentPreview, ReactionType } from '@/types'

export const POST_METRICS_EVENT = 'hushly-post-metrics'

type ReactionDelta = {
  remove?: ReactionType | null
  add?: ReactionType | null
}

export type PostMetricsPatch = {
  comment_count?: number
  comment_delta?: number
  latest_comment?: PostCommentPreview | null
  reaction_count?: number
  reaction_counts?: Record<string, number>
  reaction_delta?: ReactionDelta
  user_reaction?: ReactionType | null
}

type PostLike = {
  id: string
  reaction_count?: number
  reaction_counts?: Record<string, number>
  comment_count?: number
  latest_comment?: PostCommentPreview | null
  user_reaction?: ReactionType | null
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function emitPostMetrics(postId: string, patch: PostMetricsPatch) {
  if (!hasBrowser()) return
  window.dispatchEvent(new CustomEvent(POST_METRICS_EVENT, {
    detail: { postId, patch },
  }))
}

function applyReactionDelta(
  source?: Record<string, number>,
  delta?: ReactionDelta
) {
  const counts: Record<string, number> = {
    interesting: 0,
    funny: 0,
    deep: 0,
    curious: 0,
    ...(source || {}),
  }

  if (delta?.remove) {
    counts[delta.remove] = Math.max(0, (counts[delta.remove] || 0) - 1)
  }
  if (delta?.add) {
    counts[delta.add] = (counts[delta.add] || 0) + 1
  }

  return counts
}

function getReactionTotal(source?: Record<string, number>) {
  return Object.values(source || {}).reduce((sum, value) => sum + Number(value || 0), 0)
}

function applyPatchToPost<T extends PostLike | null | undefined>(post: T, postId: string, patch: PostMetricsPatch): T {
  if (!post || post.id !== postId) return post

  const nextReactionCounts = patch.reaction_counts
    ? {
        interesting: 0,
        funny: 0,
        deep: 0,
        curious: 0,
        ...patch.reaction_counts,
      }
    : patch.reaction_delta
      ? applyReactionDelta(post.reaction_counts, patch.reaction_delta)
      : post.reaction_counts

  const nextReactionCount = typeof patch.reaction_count === 'number'
    ? patch.reaction_count
    : nextReactionCounts
      ? getReactionTotal(nextReactionCounts)
      : post.reaction_count

  const nextCommentCount = typeof patch.comment_count === 'number'
    ? patch.comment_count
    : typeof patch.comment_delta === 'number'
      ? Math.max(0, (post.comment_count || 0) + patch.comment_delta)
      : post.comment_count

  return {
    ...post,
    ...(nextReactionCounts ? { reaction_counts: nextReactionCounts } : {}),
    ...(typeof nextReactionCount === 'number' ? { reaction_count: nextReactionCount } : {}),
    ...(typeof nextCommentCount === 'number' ? { comment_count: nextCommentCount } : {}),
    ...(patch.latest_comment !== undefined ? { latest_comment: patch.latest_comment } : {}),
    ...(patch.user_reaction !== undefined ? { user_reaction: patch.user_reaction } : {}),
  } as T
}

function mutateUserCaches(postId: string, patch: PostMetricsPatch) {
  mutate(
    (key: unknown) =>
      typeof key === 'string' &&
      key.startsWith('/api/users/') &&
      (key.includes('/full') || key.includes('/posts')),
    (current: any) => {
      if (!current) return current

      if (Array.isArray(current?.data)) {
        return {
          ...current,
          data: current.data.map((post: any) => applyPatchToPost(post, postId, patch)),
        }
      }

      if (Array.isArray(current?.data?.posts)) {
        return {
          ...current,
          data: {
            ...current.data,
            posts: current.data.posts.map((post: any) => applyPatchToPost(post, postId, patch)),
          },
        }
      }

      return current
    },
    false
  )
}

export function syncPostMetricsAcrossCaches(postId: string, patch: PostMetricsPatch, emit: boolean = true) {
  if (!postId) return

  const store = useFeedStore.getState()
  const existing = store.getPost(postId)
  if (existing) {
    store.upsertPost(applyPatchToPost(existing, postId, patch) as any)
  }

  mutate(
    (key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'),
    (pages: any[] | undefined) => {
      if (!pages) return pages
      return pages.map((page) => ({
        ...page,
        data: (page.data || []).map((post: any) => applyPatchToPost(post, postId, patch)),
      }))
    },
    false
  )

  mutate(`/api/posts/${postId}`, (current: any) => {
    if (!current?.data) return current
    return {
      ...current,
      data: applyPatchToPost(current.data, postId, patch),
    }
  }, false)

  mutateUserCaches(postId, patch)

  if (emit) {
    emitPostMetrics(postId, patch)
  }
}

export function buildLatestCommentPreview(comment: Comment | PostCommentPreview): PostCommentPreview {
  return {
    id: comment.id,
    post_id: comment.post_id,
    user_id: comment.user_id,
    parent_id: comment.parent_id ?? null,
    content: comment.content,
    created_at: comment.created_at,
    is_anonymous: comment.is_anonymous ?? false,
    user: comment.is_anonymous ? null : (comment.user || null),
  }
}

export function incrementPostCommentEverywhere(postId: string, comment: Comment | PostCommentPreview) {
  syncPostMetricsAcrossCaches(postId, {
    comment_delta: 1,
    latest_comment: buildLatestCommentPreview(comment),
  })
}

export function applyReactionEverywhere(
  postId: string,
  previousReaction: ReactionType | null | undefined,
  nextReaction: ReactionType | null | undefined
) {
  syncPostMetricsAcrossCaches(postId, {
    reaction_delta: {
      remove: previousReaction ?? null,
      add: nextReaction ?? null,
    },
    user_reaction: nextReaction ?? null,
  })
}
