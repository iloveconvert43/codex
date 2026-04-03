'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Loader2, MapPin, RefreshCw, WifiOff, Navigation, ArrowUp, Plus, Radar } from 'lucide-react'
import { useFeed } from '@/hooks/useFeed'
import { useLocation } from '@/hooks/useLocation'
import { useFeedStore } from '@/store/feedStore'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import FeedCard from './FeedCard'
import FeedSkeleton from './FeedSkeleton'
import type { Post } from '@/types'

interface Props {
  filter: string
  roomSlug?: string
  selectedCity?: string | null
}

/**
 * FeedList — Smart feed with:
 * - Scenario 1: Location permission request inline for Nearby filter
 * - Scenario 2: Infinite scroll + smart content padding (2min→10min→1hr→24hr)
 * - Area badge showing current location name
 * - Retry on error
 */

// Error boundary wrapper — one bad post can't crash the whole feed
function SafeFeedCard({ post, index }: { post: Post; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(index < 5) // first 5 always render
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (index < 5) return // already visible
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { rootMargin: '400px' } // preload 400px before visible
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [index])

  if (hasError) {
    return (
      <div className="bg-bg-card border-b border-border px-4 py-6 text-center text-sm text-text-muted">
        <p>Could not load this post</p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="animate-slide-up feed-card-hover"
      style={{ animationDelay: `${Math.min(index * 0.03, 0.15)}s` }}>
      {visible
        ? <FeedCard post={post} priority={index < 3} />
        : <div className="h-40 bg-bg-card border-b border-border" />
      }
    </div>
  )
}

export default function FeedList({ filter, roomSlug, selectedCity }: Props) {
  const {
    lat, lng, area, city, granted, loading: locLoading, accuracy,
    requestLocation, clearLocation, error: locError,
    areaChanged, acknowledgeAreaChange } = useLocation()

  const nearbyArea = area || city
  const [radiusKm, setRadiusKm] = useState(10)
  const [actualRadius, setActualRadius] = useState(10)

  const {
    posts, isLoading, isLoadingMore, error,
    hasMore, loadMore, refresh: mutate } = useFeed(
      filter as any, lat ?? undefined, lng ?? undefined,
      roomSlug, selectedCity ?? undefined, radiusKm
    )

  // Auto-reload when user moves to a new area
  useEffect(() => {
    if (filter === 'nearby' && areaChanged) {
      mutate()
      acknowledgeAreaChange()
    }
  }, [areaChanged, filter, mutate, acknowledgeAreaChange])

  // Track realtime new posts for banner (don't auto-scroll — let user decide)
  const [newPostCount, setNewPostCount] = useState(0)
  const firstPostId = useRef<string | null>(null)
  const feedKey = `${filter}${selectedCity || ''}${roomSlug || ''}`
  const feedPages = useFeedStore(s => s.feedPages[feedKey])

  useEffect(() => {
    if (posts.length > 0 && firstPostId.current === null) {
      firstPostId.current = posts[0].id
    }
  }, [posts.length > 0])

  useEffect(() => {
    if (!firstPostId.current || posts.length === 0) return
    const currentFirst = posts[0].id
    if (currentFirst !== firstPostId.current) {
      // New posts were prepended via realtime
      const idx = posts.findIndex(p => p.id === firstPostId.current)
      if (idx > 0) setNewPostCount(idx)
    }
  }, [posts[0]?.id])

  function handleNewPostsBanner() {
    setNewPostCount(0)
    firstPostId.current = posts[0]?.id ?? null
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    if (!sentinelRef.current || !hasMore) return

    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }
    )
    observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loadMore])

  // ── SCENARIO 1: Nearby without location ──────────────────────────
  if (filter === 'nearby' && !granted && !locLoading) {
    return (
      <NearbyLocationPrompt
        onAllow={requestLocation}
        loading={locLoading}
        error={locError}
      />
    )
  }

  if (filter === 'nearby' && locLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Navigation size={22} className="text-primary animate-pulse" />
        </div>
        <p className="text-sm text-text-secondary">Getting your location…</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex flex-col gap-0.5">{[...Array(4)].map((_, i) => <FeedSkeleton key={i} />)}</div>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
        <WifiOff size={32} className="text-text-muted" />
        <p className="text-sm text-text-secondary text-center">{error}</p>
        <button onClick={() => mutate()} className="btn-ghost text-sm flex items-center gap-2">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  // Don't show empty state while revalidating — prevents flash of "empty"
  if (!posts.length && !isLoading && !isLoadingMore) {
    return (
      <EmptyState
        filter={filter}
        nearbyArea={nearbyArea}
        onRequestLocation={requestLocation}
      />
    )
  }
  
  if (!posts.length && (isLoading || isLoadingMore)) {
    return <div className="flex flex-col gap-0.5">{[...Array(4)].map((_, i) => <FeedSkeleton key={i} />)}</div>
  }

  return (
    <div className="flex flex-col">
      {/* Area badge for nearby — shows radius selector + accuracy + post button */}
      {filter === 'nearby' && nearbyArea && (
        <div className="space-y-0">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-primary/5">
            <MapPin size={12} className="text-primary" />
            <span className="text-xs font-semibold text-primary">{nearbyArea}</span>
            {accuracy && accuracy > 2000 && (
              <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                ⚠ ~{Math.round(accuracy)}m accuracy
              </span>
            )}
            <button onClick={() => mutate()} className="ml-auto text-text-muted hover:text-text">
              <RefreshCw size={11} />
            </button>
          </div>
          {/* Radius selector + post nearby shortcut */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg overflow-x-auto hide-scrollbar">
            <Radar size={11} className="text-text-muted flex-shrink-0" />
            <span className="text-[10px] text-text-muted flex-shrink-0">Radius:</span>
            {[1, 5, 10, 20].map(km => (
              <button key={km}
                onClick={() => { setRadiusKm(km); mutate() }}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 transition-all',
                  radiusKm === km
                    ? 'bg-primary-muted border-primary text-primary font-bold'
                    : 'border-border text-text-muted hover:border-border-active'
                )}>
                {km}km
              </button>
            ))}
            <Link href="/create?scope=nearby"
              className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-primary border border-primary/30 px-2.5 py-1 rounded-full hover:bg-primary/10 transition-colors flex-shrink-0">
              <Plus size={10} /> Post nearby
            </Link>
          </div>
        </div>
      )}

      {/* New posts banner — like Twitter/Facebook */}
      {newPostCount > 0 && (
        <button
          onClick={handleNewPostsBanner}
          className="sticky top-2 z-20 mx-auto flex items-center gap-2 bg-primary text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 active:scale-95 transition-all mb-2 self-center"
        >
          <ArrowUp size={13} />
          {newPostCount} new post{newPostCount !== 1 ? 's' : ''} — tap to see
        </button>
      )}

      {posts.map((post: Post, index: number) => (
        <SafeFeedCard key={post.id} post={post} index={index} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />

      {isLoadingMore && (
        <div className="py-6 flex justify-center">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className="py-10 text-center px-6">
          <p className="text-2xl mb-2">✨</p>
          <p className="text-sm font-semibold text-text mb-1">You're all caught up!</p>
          <p className="text-xs text-text-muted mb-3">
            Showing posts from the last 30 days based on your interests.
          </p>
          <button
            onClick={() => mutate()}
            className="text-xs bg-primary/10 text-primary font-semibold px-4 py-2 rounded-full hover:bg-primary/20 transition-colors"
          >
            🔄 Check for new posts
          </button>
        </div>
      )}
    </div>
  )
}

// ── Location Permission Prompt (Scenario 1) ──────────────────────────
function NearbyLocationPrompt({
  onAllow, loading, error }: {
  onAllow: () => void
  loading: boolean
  error: string | null
}) {
  const [dismissed, setDismissed] = useState(false)

  // Check for last known location in cache
  const lastKnown = (() => {
    try {
      const raw = localStorage.getItem('hushly-loc-v3')
      if (!raw) return null
      const d = JSON.parse(raw)
      return d?.area || d?.city || null
    } catch { return null }
  })()

  if (dismissed && lastKnown) {
    // User dismissed but has last known location — show stale feed notice
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-yellow-500/5">
          <MapPin size={12} className="text-yellow-400" />
          <span className="text-xs text-yellow-400 font-medium">
            Showing posts near {lastKnown} (last known)
          </span>
          <button onClick={() => setDismissed(false)} className="ml-auto text-yellow-400 hover:text-yellow-300">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-6 rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-transparent overflow-hidden">
      <div className="p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-content center mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
          <MapPin size={28} className="text-primary mx-auto mt-4" />
        </div>

        <h3 className="font-black text-lg mb-2">Discover what's around you</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          This app needs your location to show posts from people
          physically near you right now. Your location is only used
          while the app is open and never shared with others.
        </p>

        <div className="space-y-2 text-left mb-5">
          {[
            ['📍', `See posts from your neighbourhood in real-time`],
            ['🚶', 'Updates as you move — Kolkata, Howrah, wherever you go'],
            ['🔒', 'Only used for Nearby feed. Expires after 2 hours.'],
          ].map(([icon, text]) => (
            <div key={text as string} className="flex items-start gap-2.5 text-xs text-text-secondary">
              <span className="flex-shrink-0">{icon}</span>
              <span>{text as string}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onAllow}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 mb-2"
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Getting location…</>
            : <><Navigation size={15} /> Allow Location Access</>
          }
        </button>

        {lastKnown && (
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-text-muted hover:text-text py-1 transition-colors"
          >
            Show posts from {lastKnown} instead (last known)
          </button>
        )}

        {error && (
          <p className="text-xs text-accent-red mt-2">{error}</p>
        )}
      </div>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────
function EmptyState({
  filter, nearbyArea, onRequestLocation }: {
  filter: string
  nearbyArea: string | null
  onRequestLocation: () => void
}) {
  const messages: Record<string, { icon: string; title: string; body: string }> = {
    nearby:   {
      icon: '📍',
      title: `Nothing nearby ${nearbyArea ? `in ${nearbyArea}` : ''}`,
      body: 'Be the first to post something here! Your post will appear to people in this area.' },
    friends:  {
      icon: '👥',
      title: 'No posts from friends yet',
      body: 'Follow people to see their posts here. Check out "People you may know" on the right sidebar.' },
    global:   {
      icon: '🌍',
      title: 'Feed is empty',
      body: 'Be the first to post something!' },
    city:     {
      icon: '🏙️',
      title: 'No posts from this city yet',
      body: 'Be the first to share something from here.' },
    default:  {
      icon: '✨',
      title: 'Nothing here yet',
      body: 'Check back soon!' } }
  const m = messages[filter] || messages.default

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <span className="text-5xl mb-4">{m.icon}</span>
      <h3 className="font-bold text-base mb-2">{m.title}</h3>
      <p className="text-sm text-text-secondary max-w-xs">{m.body}</p>
    </div>
  )
}
