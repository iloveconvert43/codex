/**
 * store/feedStore.ts — Global feed state with Zustand
 * 
 * Handles:
 * - Optimistic reaction updates across all components
 * - Real-time post additions
 * - Post deletion cache cleanup
 * - Cursor-based pagination state
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Post, ReactionType, FeedFilter } from '@/types'

interface FeedStore {
  // Post cache: postId → Post (shared across feed + detail)
  postCache: Record<string, Post>
  
  // Feed pages by filter key
  feedPages: Record<string, { cursor: string | null; postIds: string[]; hasMore: boolean }>
  
  // Actions
  upsertPost: (post: Post) => void
  upsertPosts: (posts: Post[]) => void
  removePost: (postId: string) => void
  
  // Optimistic reaction update
  applyReaction: (postId: string, type: ReactionType | null, prev: ReactionType | null | undefined) => void
  
  // Feed page management
  setFeedPage: (key: string, cursor: string | null, postIds: string[], hasMore: boolean, append: boolean) => void
  clearFeed: (key: string) => void
  
  // Real-time: prepend new post to feed
  prependPost: (key: string, post: Post) => void
  
  getPost: (postId: string) => Post | undefined
  getFeedPostIds: (key: string) => string[]
}

export const useFeedStore = create<FeedStore>()(
  subscribeWithSelector((set, get) => ({
    postCache: {},
    feedPages: {},

    upsertPost: (post) => set(s => ({
      postCache: { ...s.postCache, [post.id]: { ...s.postCache[post.id], ...post } }
    })),

    upsertPosts: (posts) => set(s => {
      const updates: Record<string, Post> = {}
      for (const p of posts) {
        updates[p.id] = { ...s.postCache[p.id], ...p }
      }
      const merged = { ...s.postCache, ...updates }
      // Prune cache if it grows too large (keep most recent 500)
      const keys = Object.keys(merged)
      if (keys.length > 500) {
        const sorted = keys.sort((a, b) =>
          new Date(merged[b].created_at).getTime() - new Date(merged[a].created_at).getTime()
        )
        const pruned: Record<string, Post> = {}
        for (const k of sorted.slice(0, 500)) pruned[k] = merged[k]
        return { postCache: pruned }
      }
      return { postCache: merged }
    }),

    removePost: (postId) => set(s => {
      const { [postId]: _, ...rest } = s.postCache
      // Remove from all feed pages
      const feedPages = Object.fromEntries(
        Object.entries(s.feedPages).map(([k, v]) => [
          k, { ...v, postIds: v.postIds.filter(id => id !== postId) }
        ])
      )
      return { postCache: rest, feedPages }
    }),

    applyReaction: (postId, type, prev) => set(s => {
      const post = s.postCache[postId]
      if (!post) return s

      const counts = {
        ...(post.reaction_counts ?? { interesting: 0, funny: 0, deep: 0, curious: 0 })
      } as Record<ReactionType, number>

      // Remove previous reaction
      if (prev) counts[prev] = Math.max(0, (counts[prev] || 0) - 1)
      // Add new reaction (if not toggling off)
      if (type && type !== prev) counts[type] = (counts[type] || 0) + 1

      return {
        postCache: {
          ...s.postCache,
          [postId]: {
            ...post,
            reaction_counts: counts,
            user_reaction: type === prev ? null : type }
        }
      }
    }),

    setFeedPage: (key, cursor, postIds, hasMore, append) => set(s => {
      const existing = s.feedPages[key]
      return {
        feedPages: {
          ...s.feedPages,
          [key]: {
            cursor,
            postIds: append ? [...(existing?.postIds ?? []), ...postIds] : postIds,
            hasMore }
        }
      }
    }),

    clearFeed: (key) => set(s => ({
      feedPages: { ...s.feedPages, [key]: { cursor: null, postIds: [], hasMore: true } }
    })),

    prependPost: (key, post) => set(s => {
      const existing = s.feedPages[key]
      return {
        postCache: { ...s.postCache, [post.id]: post },
        feedPages: {
          ...s.feedPages,
          [key]: {
            ...existing,
            postIds: [post.id, ...(existing?.postIds ?? []).filter(id => id !== post.id)],
            cursor: existing?.cursor ?? null,
            hasMore: existing?.hasMore ?? true }
        }
      }
    }),

    getPost: (postId) => get().postCache[postId],
    getFeedPostIds: (key) => get().feedPages[key]?.postIds ?? [] }))
)

// Key generator for feed pages
export function feedKey(filter: FeedFilter, lat?: number, lng?: number) {
  if (filter === 'nearby' && lat && lng) {
    return `nearby:${lat.toFixed(2)}:${lng.toFixed(2)}`
  }
  return filter
}
