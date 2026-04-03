/**
 * hooks/useFeed.ts — Upgraded feed hook
 * 
 * Changes from v1:
 * - Cursor-based pagination (no page numbers)
 * - Zustand feedStore for global post cache
 * - Optimistic reactions update feedStore directly
 * - Real-time new posts via Supabase channel
 * - SWR still used for per-page fetching, feedStore for cache
 */
'use client'

import { useEffect, useRef, useCallback } from 'react'
import useSWRInfinite from 'swr/infinite'
import { mutate } from 'swr'
import { supabase } from '@/lib/supabase'
import { api, swrFetcher, getErrorMessage } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { usePendingFeedPosts } from '@/hooks/usePendingPosts'
import { mergePostsWithPending, removePendingPosts } from '@/lib/pendingPosts'
import { useFeedStore } from '@/store/feedStore'
import type { Post, FeedFilter, ReactionType } from '@/types'

// Feed response shape from upgraded API
interface FeedPage {
  data: Post[]
  hasMore: boolean
  nextCursor: string | null
}

const feedFetcher = (url: string) => swrFetcher<FeedPage>(url)
const FEED_REFRESH_KEY = 'hushly-feed-refresh'

function prependPostToPages(pages: FeedPage[] | undefined, post: Post): FeedPage[] {
  if (!pages || pages.length === 0) {
    return [{ data: [post], hasMore: false, nextCursor: post.created_at ?? null }]
  }

  const alreadyExists = pages.some((page) =>
    (page.data ?? []).some((candidate) => candidate.id === post.id)
  )
  if (alreadyExists) return pages

  return pages.map((page, index) => {
    if (index !== 0) return page
    return {
      ...page,
      data: [post, ...(page.data ?? [])].slice(0, 20),
    }
  })
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export function useFeed(filter: FeedFilter, lat?: number, lng?: number, roomSlug?: string, selectedCity?: string, radiusKm: number = 10) {
  // Track seen post IDs — reset when filter/city/room changes
  const { profile } = useAuth()
  const seenPostIds = useRef<Set<string>>(new Set())
  const prevFilterKey = useRef<string>('')
  const freshNonceRef = useRef<string | null>(
    typeof window !== 'undefined' ? sessionStorage.getItem(FEED_REFRESH_KEY) : null
  )
  const filterKey = `${filter}:${selectedCity || ''}:${roomSlug || ''}`
  const pendingPosts = usePendingFeedPosts(profile?.id, filter, lat, lng, roomSlug, selectedCity, radiusKm)

  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey
    seenPostIds.current = new Set()  // reset seen IDs on filter change
  }
  const { upsertPost, upsertPosts } = useFeedStore()

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  function buildURL(cursor: string | null, prev: FeedPage | null, pageIndex: number) {
    if (prev && !prev.hasMore) return null
    const p = new URLSearchParams({ filter, limit: '20' })
    if (cursor) p.set('cursor', cursor)
    // Pass page depth so server can expand time window for infinite scroll
    p.set('size', String(pageIndex + 1))
    if (pageIndex === 0 && freshNonceRef.current) {
      p.set('fresh', freshNonceRef.current)
    }

    if (filter === 'nearby' && lat != null && lng != null) {
      p.set('lat', String(lat))
      p.set('lng', String(lng))
      p.set('radius', String(radiusKm))
    }
    if (filter === 'room' && roomSlug) {
      p.set('room', roomSlug)
    }
    if (filter === 'city' && selectedCity) {
      p.set('city', selectedCity)
    }
    // Anti-repetition: send seen IDs for ALL feed types (not just global)
    // This prevents duplicate posts across pages for all feeds
    // Only send seen IDs for page 2+ to prevent feed disappearing
    if (pageIndex > 0 && seenPostIds.current.size > 0) {
      const idsArr = Array.from(seenPostIds.current).slice(-20)
      p.set('seen', idsArr.join(','))
    }
    return `/api/feed?${p}`
  }

  const { data, error, size, setSize, isValidating, mutate: mutateFeed } = useSWRInfinite(
    (index, prev: FeedPage | null) => {
      const cursor = prev?.nextCursor ?? null
      return buildURL(index === 0 ? null : cursor, prev, index)
    },
    feedFetcher,
    {
      revalidateFirstPage: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
      errorRetryCount: 2,
      errorRetryInterval: 3000,
      dedupingInterval: 10000,
      revalidateAll: false,
      }
  )

  // Sync SWR data into feedStore
  useEffect(() => {
    const serverPosts = data?.flatMap(p => p.data ?? []) ?? []
    const allPosts = mergePostsWithPending(serverPosts, pendingPosts)
    if (allPosts.length > 0) upsertPosts(allPosts)
  }, [data, pendingPosts, upsertPosts])

  useEffect(() => {
    if (!data) return

    if (!pendingPosts.length) {
      if (freshNonceRef.current) {
        try { sessionStorage.removeItem(FEED_REFRESH_KEY) } catch {}
        freshNonceRef.current = null
      }
      return
    }

    const serverIds = data.flatMap((page) => (page.data ?? []).map((post) => post.id))
    const matchedPendingIds = pendingPosts
      .map((post) => post.id)
      .filter((id) => serverIds.includes(id))
    if (!matchedPendingIds.length) return

    if (freshNonceRef.current) {
      try { sessionStorage.removeItem(FEED_REFRESH_KEY) } catch {}
      freshNonceRef.current = null
    }
    removePendingPosts(matchedPendingIds)
  }, [data, pendingPosts])

  // Real-time new posts subscription — works for global, city, nearby, friends
  useEffect(() => {
    // Build a unique channel name per filter so each feed type gets its own stream
    const channelName = filter === 'nearby'
      ? `feed:nearby:${lat?.toFixed(2)}:${lng?.toFixed(2)}`
      : `feed:${filter}${selectedCity ? ':' + selectedCity : ''}${roomSlug ? ':' + roomSlug : ''}`

    const channel = supabase
      .channel(channelName)
      // New posts
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: 'is_deleted=eq.false',
      }, (payload) => {
        const newPost = payload.new as any
        const postAge = Date.now() - new Date(newPost.created_at).getTime()
        if (postAge > 30000) return
        if (filter === 'city' && selectedCity && newPost.city !== selectedCity) return
        if (filter === 'room' && roomSlug) {
          if (newPost.room_id == null) return
          void mutateFeed()
          return
        }
        if (filter === 'friends') {
          void mutateFeed()
          return
        }
        if (filter === 'nearby') {
          if (lat == null || lng == null) return
          if (newPost.latitude == null || newPost.longitude == null) return
          if (distanceKm(lat, lng, Number(newPost.latitude), Number(newPost.longitude)) > radiusKm) return
        }

        upsertPost(newPost as Post)
        mutateFeed((pages) => {
          if (!pages || pages.length === 0) {
            return [{ data: [newPost as Post], hasMore: false, nextCursor: newPost.created_at ?? null }]
          }

          const alreadyExists = pages.some(page =>
            (page.data ?? []).some(post => post.id === newPost.id)
          )
          if (alreadyExists) return pages

          return pages.map((page, index) => {
            if (index !== 0) return page
            return {
              ...page,
              data: [newPost as Post, ...(page.data ?? [])].slice(0, 20),
            }
          })
        }, false)
      })
      // Realtime reaction/comment/view count updates
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
      }, (payload) => {
        const updated = payload.new as any
        if (!updated?.id) return
        const { upsertPost, getPost, removePost } = useFeedStore.getState()
        if (updated.is_deleted) {
          removePost(updated.id)
          mutateFeed((pages) => {
            if (!pages) return pages
            return pages.map(page => ({
              ...page,
              data: (page.data ?? []).filter(post => post.id !== updated.id),
            }))
          }, false)
          return
        }

        // Update the post in feedStore for immediate UI update
        const existing = getPost(updated.id)
        if (existing) {
          upsertPost({
            ...existing,
            comment_count:   updated.comment_count   ?? existing.comment_count,
            view_count:      updated.view_count      ?? existing.view_count,
            reshare_count:   updated.reshare_count   ?? existing.reshare_count,
            reveal_count:    updated.reveal_count    ?? existing.reveal_count,
          })
        }
        mutateFeed((pages) => {
          if (!pages) return pages
          return pages.map(page => ({
            ...page,
            data: (page.data ?? []).map(post =>
              post.id === updated.id
                ? {
                    ...post,
                    comment_count: updated.comment_count ?? post.comment_count,
                    view_count: updated.view_count ?? post.view_count,
                    reshare_count: updated.reshare_count ?? post.reshare_count,
                    reveal_count: updated.reveal_count ?? post.reveal_count,
                  }
                : post
            ),
          }))
        }, false)
      })
      .subscribe()

    realtimeRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      realtimeRef.current = null
    }
  }, [filter, lat, lng, mutateFeed, radiusKm, roomSlug, selectedCity, upsertPost])

  const serverPosts: Post[] = data ? data.flatMap((p) => p.data ?? []) : []
  const posts: Post[] = mergePostsWithPending(serverPosts, pendingPosts)
  // Track all seen post IDs for anti-repetition
  useEffect(() => {
    posts.forEach(p => seenPostIds.current.add(p.id))
  }, [posts.length]) // eslint-disable-line
  const isLoading = !data && !error && pendingPosts.length === 0
  const hasUnconfirmedPendingPosts = pendingPosts.some((pendingPost) =>
    !serverPosts.some((serverPost) => serverPost.id === pendingPost.id)
  )
  const hasMore = hasUnconfirmedPendingPosts || (data?.[data.length - 1]?.hasMore ?? false)

  // ── Auto-reload nearby when user moves to a new area ───────────
  // Polls localStorage every 5s for area changes written by useLocation.
  // When Rahul moves from Kolkata → Howrah, feed reloads automatically
  // showing Howrah posts ranked by social graph + engagement score.
  useEffect(() => {
    if (filter !== 'nearby') return
    let lastArea: string | null = null

    const tid = setInterval(() => {
      try {
        const raw = localStorage.getItem('hushly-loc-v3')
        if (!raw) return
        const loc = JSON.parse(raw)
        const curArea = loc.area || loc.city
        if (lastArea === null) { lastArea = curArea; return }
        if (curArea && curArea !== lastArea) {
          lastArea = curArea
          mutateFeed()
          // Dynamic import avoids SSR issues with toast
          import('react-hot-toast').then(({ default: t }) => {
            t(`📍 Now showing posts near ${curArea}`, {
              duration: 3000,
              icon: '📍' })
          })
        }
      } catch { /* silently ignore */ }
    }, 5000) // check every 5s — lightweight (just reads localStorage)

    return () => clearInterval(tid)
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    posts,
    isLoading,
    error: error ? getErrorMessage(error) : null,
    hasMore,
    loadMore: useCallback(() => setSize(s => s + 1), [setSize]),
    isLoadingMore: isValidating && size > 1,
    refresh: useCallback(() => mutateFeed(), [mutateFeed]) }
}

// ── Optimistic reaction toggle ────────────────────────────
export async function optimisticReact(
  postId: string,
  type: ReactionType,
  currentReaction: ReactionType | null | undefined
) {
  const { applyReaction } = useFeedStore.getState()
  const newType = type === currentReaction ? null : type

  // 1. Instant UI update via Zustand store
  applyReaction(postId, newType, currentReaction)

  // 2. Also update SWR cache for feed pages
  mutate(
    (key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'),
    (pages: FeedPage[] | undefined) => {
      if (!pages) return pages
      return pages.map(page => ({
        ...page,
        data: (page.data ?? []).map(post => {
          if (post.id !== postId) return post
          const counts = { ...(post.reaction_counts || { interesting: 0, funny: 0, deep: 0, curious: 0 }) } as Record<ReactionType, number>
          if (currentReaction) counts[currentReaction] = Math.max(0, (counts[currentReaction] || 0) - 1)
          if (newType) counts[newType] = (counts[newType] || 0) + 1
          return { ...post, reaction_counts: counts, user_reaction: newType }
        }) }))
    },
    false
  )

  // Update single post SWR cache
  mutate(`/api/posts/${postId}`, (cur: any) => {
    if (!cur?.data) return cur
    const post = cur.data
    const counts = { ...(post.reaction_counts || {}) } as Record<ReactionType, number>
    if (currentReaction) counts[currentReaction] = Math.max(0, (counts[currentReaction] || 0) - 1)
    if (newType) counts[newType] = (counts[newType] || 0) + 1
    return { ...cur, data: { ...post, reaction_counts: counts, user_reaction: newType } }
  }, false)

  // 3. API call with error revert
  try {
    if (newType === null) {
      await api.delete(`/api/posts/${postId}/react`, { requireAuth: true })
    } else {
      await api.post(`/api/posts/${postId}/react`, { type }, { requireAuth: true })
    }
  } catch (err) {
    // Revert on failure
    applyReaction(postId, currentReaction ?? null, newType)
    mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'))
    mutate(`/api/posts/${postId}`)
    throw err
  }
}

// ── Mystery reveal ─────────────────────────────────────────
export async function revealPost(postId: string) {
  const json = await api.post<{ data: { content: string | null; image_url: string | null; video_url: string | null; video_thumbnail_url: string | null } }>(
    `/api/posts/${postId}/reveal`,
    {},
    { requireAuth: true }
  )
  if (!json.data) throw new Error('Reveal failed')

  const { upsertPost, getPost } = useFeedStore.getState()
  const existing = getPost(postId)
  if (existing) {
    upsertPost({ ...existing, ...json.data, has_revealed: true })
  }

  // Update all SWR caches
  const revealUpdate = (pages: FeedPage[] | undefined) => {
    if (!pages) return pages
    return pages.map(page => ({
      ...page,
      data: (page.data ?? []).map(post =>
        post.id === postId
          ? { ...post, ...json.data, has_revealed: true }
          : post
      ) }))
  }

  mutate(
    (key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'),
    revealUpdate, false
  )
  mutate(`/api/posts/${postId}`, (cur: any) => {
    if (!cur?.data) return cur
    return { ...cur, data: { ...cur.data, ...json.data, has_revealed: true } }
  }, false)

  return json.data
}
