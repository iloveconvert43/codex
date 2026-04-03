'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FeedFilter, Post } from '@/types'
import {
  getPendingPost,
  getPendingPostsForFeed,
  getPendingPostsForUser,
  PENDING_POSTS_EVENT,
} from '@/lib/pendingPosts'

function subscribe(listener: () => void) {
  if (typeof window === 'undefined') return () => {}

  const handler = () => listener()
  window.addEventListener(PENDING_POSTS_EVENT, handler as EventListener)
  window.addEventListener('storage', handler)

  return () => {
    window.removeEventListener(PENDING_POSTS_EVENT, handler as EventListener)
    window.removeEventListener('storage', handler)
  }
}

export function usePendingFeedPosts(
  ownerId: string | null | undefined,
  filter: FeedFilter,
  lat?: number,
  lng?: number,
  roomSlug?: string,
  selectedCity?: string,
  radiusKm: number = 10
) {
  const read = useCallback(
    () => getPendingPostsForFeed(ownerId, filter, lat, lng, roomSlug, selectedCity, radiusKm),
    [ownerId, filter, lat, lng, roomSlug, selectedCity, radiusKm]
  )
  const [posts, setPosts] = useState<Post[]>(() => read())

  useEffect(() => {
    setPosts(read())
    return subscribe(() => setPosts(read()))
  }, [read])

  return posts
}

export function usePendingUserPosts(userId?: string | null) {
  const read = useCallback(() => getPendingPostsForUser(userId), [userId])
  const [posts, setPosts] = useState<Post[]>(() => read())

  useEffect(() => {
    setPosts(read())
    return subscribe(() => setPosts(read()))
  }, [read])

  return posts
}

export function usePendingPost(postId?: string | null) {
  const read = useCallback(() => (postId ? getPendingPost(postId) : null), [postId])
  const [post, setPost] = useState<Post | null>(() => read())

  useEffect(() => {
    setPost(read())
    return subscribe(() => setPost(read()))
  }, [read])

  return post
}
