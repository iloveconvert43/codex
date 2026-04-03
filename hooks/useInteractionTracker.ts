/**
 * hooks/useInteractionTracker.ts
 * 
 * Tracks user behavior for recommendation learning.
 * Uses IntersectionObserver to measure dwell time on posts.
 * Batches interactions and sends via sendBeacon (survives page unload).
 * 
 * Signals tracked:
 *   - dwell >3s  → positive signal (user read it)
 *   - dwell <1s  → skip signal (user scrolled past)
 *   - seen       → view signal
 */
'use client'

import { useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface Interaction {
  post_id: string
  action: string
  tag?: string
  dwell_ms?: number
}

const BATCH_SIZE     = 20
const FLUSH_INTERVAL = 30 * 1000  // flush every 30s
const DWELL_DEEP     = 10 * 1000  // 10s = "deeply read" (strong signal)
const DWELL_POSITIVE =  3 * 1000  // 3s  = "read"
const DWELL_SKIP     =  1 * 1000  // <1s = "skip" (mild negative)

export function useInteractionTracker() {
  const { isLoggedIn } = useAuth()
  const queue = useRef<Interaction[]>([])
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const postTimers = useRef<Map<string, number>>(new Map())

  const flush = useCallback(() => {
    if (!isLoggedIn || queue.current.length === 0) return
    const batch = queue.current.splice(0, BATCH_SIZE)
    const payload = JSON.stringify(batch)

    // sendBeacon works even on page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/interactions', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true }).catch(() => {})
    }
  }, [isLoggedIn])

  // Set up periodic flush
  useEffect(() => {
    if (!isLoggedIn) return
    flushTimer.current = setInterval(flush, FLUSH_INTERVAL)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('visibilitychange', handleVisibility)
      flush()
    }
  }, [isLoggedIn, flush])

  const track = useCallback((interaction: Interaction) => {
    if (!isLoggedIn) return
    queue.current.push(interaction)
    if (queue.current.length >= BATCH_SIZE) flush()
  }, [isLoggedIn, flush])

  // Track when post enters/leaves viewport (with re-read detection)
  const trackPostVisibility = useCallback((postId: string, element: HTMLElement | null) => {
    if (!element || !isLoggedIn) return

    let viewCount = 0  // how many times this post entered viewport in this session

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          viewCount++
          postTimers.current.set(postId, Date.now())

          if (viewCount === 1) {
            track({ post_id: postId, action: 'view' })
          } else if (viewCount >= 2) {
            // Re-read: user scrolled back up to read again — strong positive signal
            track({ post_id: postId, action: 'dwell', dwell_ms: 5000 })
          }
        } else {
          const startTime = postTimers.current.get(postId)
          if (startTime) {
            const dwell = Date.now() - startTime
            postTimers.current.delete(postId)

            if (dwell >= DWELL_DEEP) {
              // 10s+ = deeply engaged
              track({ post_id: postId, action: 'dwell', dwell_ms: dwell })
              track({ post_id: postId, action: 'dwell', dwell_ms: dwell }) // double-weight
            } else if (dwell >= DWELL_POSITIVE) {
              track({ post_id: postId, action: 'dwell', dwell_ms: dwell })
            } else if (dwell < DWELL_SKIP) {
              // Only count as skip if first view (not a re-read attempt)
              if (viewCount === 1) {
                track({ post_id: postId, action: 'skip', dwell_ms: dwell })
              }
            }
          }
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isLoggedIn, track])

  const trackReact = useCallback((postId: string) => {
    track({ post_id: postId, action: 'react' })
  }, [track])

  const trackReveal = useCallback((postId: string) => {
    track({ post_id: postId, action: 'reveal' })
  }, [track])

  const trackTagTap = useCallback((postId: string, tag: string) => {
    track({ post_id: postId, action: 'tag_tap', tag })
  }, [track])

  const trackHide = useCallback((postId: string) => {
    track({ post_id: postId, action: 'hide' })
    flush()  // immediate flush for hide
  }, [track, flush])

  return { trackPostVisibility, trackReact, trackReveal, trackTagTap, trackHide }
}
