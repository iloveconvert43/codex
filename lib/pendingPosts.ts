import type { FeedFilter, Post } from '@/types'

export const PENDING_POSTS_EVENT = 'hushly-pending-posts-change'

const PENDING_POSTS_KEY = 'hushly-pending-posts-v1'
const PENDING_POST_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PENDING_POSTS = 50

type PendingPostEntry = {
  post: Post
  storedAt: number
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function emitPendingPostsChange() {
  if (!hasBrowser()) return
  window.dispatchEvent(new CustomEvent(PENDING_POSTS_EVENT))
}

function normalizePost(post: Post): Post {
  return {
    ...post,
    tags: Array.isArray(post.tags) ? post.tags : [],
    reaction_counts: post.reaction_counts || { interesting: 0, funny: 0, deep: 0, curious: 0 },
    comment_count: post.comment_count ?? 0,
    reshare_count: post.reshare_count ?? 0,
    reveal_count: post.reveal_count ?? 0,
    view_count: post.view_count ?? 0,
    is_deleted: post.is_deleted ?? false,
    has_revealed: post.has_revealed ?? false,
  }
}

function isValidEntry(entry: PendingPostEntry | null | undefined): entry is PendingPostEntry {
  if (!entry?.post?.id || !entry?.post?.user_id || !entry?.storedAt) return false
  if (Date.now() - entry.storedAt > PENDING_POST_TTL_MS) return false
  return !entry.post.is_deleted
}

function writeEntries(entries: PendingPostEntry[]) {
  if (!hasBrowser()) return
  const trimmed = entries.slice(0, MAX_PENDING_POSTS)
  try {
    window.localStorage.setItem(PENDING_POSTS_KEY, JSON.stringify(trimmed))
  } catch {
    return
  }
  emitPendingPostsChange()
}

function readEntries(): PendingPostEntry[] {
  if (!hasBrowser()) return []
  try {
    const raw = window.localStorage.getItem(PENDING_POSTS_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    const entries = Array.isArray(parsed)
      ? parsed
          .map((entry: PendingPostEntry) => ({
            post: normalizePost(entry.post),
            storedAt: entry.storedAt,
          }))
          .filter(isValidEntry)
      : []

    if (Array.isArray(parsed) && entries.length !== parsed.length) {
      try {
        window.localStorage.setItem(PENDING_POSTS_KEY, JSON.stringify(entries.slice(0, MAX_PENDING_POSTS)))
      } catch {}
    }

    return entries
      .sort((a, b) => b.storedAt - a.storedAt)
  } catch {
    return []
  }
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

export function addPendingPost(post: Post) {
  const normalized = normalizePost(post)
  const existing = readEntries().filter((entry) => entry.post.id !== normalized.id)
  writeEntries([{ post: normalized, storedAt: Date.now() }, ...existing])
}

export function removePendingPost(postId: string) {
  const existing = readEntries()
  const filtered = existing.filter((entry) => entry.post.id !== postId)
  if (filtered.length === existing.length) return
  writeEntries(filtered)
}

export function removePendingPosts(postIds: string[]) {
  if (!postIds.length) return
  const idSet = new Set(postIds)
  const existing = readEntries()
  const filtered = existing.filter((entry) => !idSet.has(entry.post.id))
  if (filtered.length === existing.length) return
  writeEntries(filtered)
}

export function getPendingPost(postId: string): Post | null {
  return readEntries().find((entry) => entry.post.id === postId)?.post || null
}

export function getPendingPostsForUser(userId?: string | null): Post[] {
  if (!userId) return []
  return readEntries()
    .filter((entry) => entry.post.user_id === userId)
    .map((entry) => entry.post)
}

export function getPendingPostsForFeed(
  ownerId: string | null | undefined,
  filter: FeedFilter,
  lat?: number,
  lng?: number,
  roomSlug?: string,
  selectedCity?: string,
  radiusKm: number = 10
): Post[] {
  if (!ownerId) return []

  return readEntries()
    .map((entry) => entry.post)
    .filter((post) => post.user_id === ownerId)
    .filter((post) => {
      if (post.is_deleted) return false

      if (filter === 'friends') return false

      if (filter === 'city') {
        return !!selectedCity && post.city === selectedCity
      }

      if (filter === 'nearby') {
        if (lat == null || lng == null) return false
        if (post.latitude == null || post.longitude == null) return false
        return distanceKm(lat, lng, Number(post.latitude), Number(post.longitude)) <= radiusKm
      }

      if (filter === 'room') {
        return !!roomSlug && ((post as any).room?.slug === roomSlug)
      }

      return true
    })
}

export function mergePostsWithPending(posts: Post[], pendingPosts: Post[]): Post[] {
  if (!pendingPosts.length) return posts

  const merged = [...pendingPosts]
  const indexById = new Map(merged.map((post, index) => [post.id, index]))

  for (const post of posts) {
    const existingIndex = indexById.get(post.id)
    if (existingIndex == null) {
      indexById.set(post.id, merged.length)
      merged.push(post)
      continue
    }

    merged[existingIndex] = {
      ...merged[existingIndex],
      ...post,
    }
  }

  return merged
}
