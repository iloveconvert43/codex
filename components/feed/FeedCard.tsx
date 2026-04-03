'use client'

import { useState, useRef, memo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Bookmark, Share2, MoreHorizontal, MapPin, Eye, Flag, Repeat2 } from 'lucide-react'
import { formatDistance, getRelativeTime, REACTION_CONFIG, cn } from '@/lib/utils'
import { optimisticReact, revealPost } from '@/hooks/useFeed'
import { useAuth } from '@/hooks/useAuth'
import { useInteractionTracker } from '@/hooks/useInteractionTracker'
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts'
import { supabase } from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import { getErrorMessage, api } from '@/lib/api'
import { analytics } from '@/lib/analytics'
import { getOptimizedUrl, getLQIPUrl } from '@/lib/imagekit'
import type { Post, ReactionType } from '@/types'

// ── Progressive Image — LQIP blur-up (Facebook-style) ──────────
const ProgressiveImage = memo(function ProgressiveImage({ src, alt, priority, className }: {
  src: string; alt: string; priority?: boolean; className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const optimized = useFallback ? src : getOptimizedUrl(src, 'feed')
  const lqip = useFallback ? src : getLQIPUrl(src)

  return (
    <div className="relative w-full overflow-hidden bg-bg-card2">
      {/* LQIP placeholder — loads instantly (~1KB) */}
      {!loaded && lqip !== src && (
        <img src={lqip} alt="" aria-hidden
          className={cn("w-full max-h-80 object-cover rounded-xl blur-sm scale-105 transition-opacity", className)} />
      )}
      {/* Full quality image — loads in background */}
      <img
        src={optimized}
        alt={alt}
        className={cn(
          "w-full max-h-80 object-cover rounded-xl transition-all duration-300",
          loaded ? "opacity-100" : "opacity-0 absolute inset-0",
          className
        )}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          // If optimized URL fails, fall back to original URL
          if (!useFallback) setUseFallback(true)
        }}
      />
    </div>
  )
})

const FeedCard = memo(function FeedCard({ post, onReshare, priority }: { post: Post; onReshare?: (post: Post) => void; priority?: boolean }) {
  const { isLoggedIn, profile } = useAuth()
  // Live reaction + comment counts (realtime from DB triggers)
  const liveCounts = useRealtimePostCounts(post.id, {
    reaction_count: Object.values(post.reaction_counts || {}).reduce((a: any, b: any) => a + b, 0),
    comment_count: post.comment_count ?? 0,
  })
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const { trackPostVisibility, trackReact, trackReveal, trackTagTap, trackHide } = useInteractionTracker()
  const [revealing, setRevealing] = useState(false)
  const [localRevealed, setLocalRevealed] = useState(post.has_revealed ?? false)
  const [reactingType, setReactingType] = useState<string | null>(null)
  const [localContent, setLocalContent] = useState(post.content)
  const [localImage, setLocalImage] = useState(post.image_url)
  const [localVideo, setLocalVideo] = useState<string | null>((post as any).video_url ?? null)
  const [showMenu, setShowMenu] = useState(false)
  const [bookmarked, setBookmarked] = useState<boolean>((post as any).is_bookmarked ?? false)
  const [bookmarkLoading, setBookmarkLoading] = useState(false)

  async function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isLoggedIn) { router.push('/login'); return }
    if (bookmarkLoading) return
    setBookmarkLoading(true)
    try {
      const res = await api.post('/api/bookmarks', { post_id: post.id }, { requireAuth: true }) as any
      setBookmarked(res.bookmarked)
      toast.success(res.bookmarked ? 'Saved! ✓' : 'Removed from saved', { duration: 2000 })
    } catch { toast.error('Failed to save') }
    finally { setBookmarkLoading(false) }
  }

  async function handleBlock(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isLoggedIn || !post.user_id) return
    if (!confirm('Block this user? You won\'t see their posts.')) return
    try {
      await api.post(`/api/users/${post.user_id}/block`, {}, { requireAuth: true })
      toast.success('User blocked')
      setShowMenu(false)
    } catch { toast.error('Failed') }
  }

  // Track dwell time for recommendation learning
  useEffect(() => {
    return trackPostVisibility(post.id, cardRef.current)
  }, [post.id]) // eslint-disable-line

  const statusLine = (() => {
    const p = post as any
    const parts: string[] = []
    if (p.feeling_emoji) parts.push(`${p.feeling_emoji} feeling ${p.feeling || ''}`)
    else if (p.activity_emoji) parts.push(`${p.activity_emoji} ${p.activity || ''}${p.activity_detail ? ' ' + p.activity_detail : ''}`)
    if (p.location_name) parts.push(`📍 ${p.location_name}`)
    if (p.is_life_event && p.life_event_emoji) parts.push(`${p.life_event_emoji} ${(p.life_event_type||'').replace(/_/g,' ')}`)
    return parts.join(' · ')
  })()

  const isMysteryHidden = post.is_mystery && !localRevealed
  const resharedFrom = post.reshared_from_id ? post.reshared_from : null
  const displayUser = post.is_anonymous ? null : post.user
  const displayName = post.is_anonymous
    ? 'Anonymous'
    : (displayUser?.display_name || displayUser?.full_name || displayUser?.username || 'Someone')
  const isOwner = !!(profile && post.user_id === profile.id)

  async function handleReact(type: ReactionType) {
    if (!isLoggedIn) {
      console.warn('[FeedCard] React blocked: not logged in', { profileExists: !!profile })
      toast.error('Sign in to react')
      return
    }
    setReactingType(type)
    try {
      analytics.track('post_react', { post_id: post.id, type })
      await optimisticReact(post.id, type, post.user_reaction)
    } catch (err) {
      console.error('[FeedCard] React error:', err)
      toast.error(getErrorMessage(err))
    } finally {
      setTimeout(() => setReactingType(null), 300)
    }
  }

  async function handleReveal() {
    if (!isLoggedIn) { toast.error('Sign in to reveal'); return }
    if (revealing || localRevealed) return
    setRevealing(true)
    try {
      analytics.track('mystery_reveal', { post_id: post.id })
      const data = await revealPost(post.id)
      setLocalContent(data.content)
      setLocalImage(data.image_url)
      setLocalVideo((data as any).video_url ?? null)
      setLocalRevealed(true)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setRevealing(false) }
  }

  async function handleShare() {
    const url = `${window.location.origin}/post/${post.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'tryHushly', url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied!')
      }
    } catch {}
  }

  async function handleReshare() {
    if (!isLoggedIn) { toast.error('Sign in to reshare'); return }
    if (onReshare) { onReshare(post); return }
    try {
      await api.post('/api/posts', {
        reshared_from_id: post.id,
        reshare_comment: null,
        is_anonymous: false,
        is_mystery: false }, { requireAuth: true })
      // Reshare = strong positive signal → update affinity + network
      fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ post_id: post.id, action: 'share' }]),
        keepalive: true
      }).catch(() => {})
      toast.success('Reshared! 🔄')
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setShowMenu(false)
    if (!confirm('Delete this post? This cannot be undone.')) return
    setDeleting(true)
    try {
      // Soft-delete the post first (always), then cleanup uploaded media
      await api.delete(`/api/posts/${post.id}`, { requireAuth: true })
      // Cleanup uploaded media (non-blocking, best effort)
      api.post('/api/upload/delete', { post_id: post.id }, { requireAuth: true }).catch(() => {})
      toast.success('Post deleted')
      // Trigger feed refresh
      const { mutate } = await import('swr')
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'))
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setDeleting(false) }
  }

  async function handleReport() {
    if (!isLoggedIn) { toast.error('Sign in to report'); return }
    setShowMenu(false)
    const reasons = ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'misinformation', 'other']
    const reason = window.prompt(`Report reason:\n${reasons.join(', ')}`)
    if (!reason) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ post_id: post.id, reason: reason.toLowerCase().trim() }) })
      if (!res.ok) throw new Error()
      toast.success('Report submitted. Thank you.')
    } catch { toast.error('Could not submit report') }
  }

  async function handleHide() {
    setShowMenu(false)
    trackHide(post.id)
    toast.success("Post hidden. We'll show you less like this.", { duration: 3000 })
  }

  async function handleFeedback(type: 'less' | 'more' | 'not_interested') {
    setShowMenu(false)
    try {
      const res = await api.post('/api/feed/feedback', { post_id: post.id, feedback: type }, { requireAuth: true }) as any
      toast.success(res.message || 'Feedback saved', { duration: 3000 })
    } catch { toast.error('Could not save feedback') }
  }

  return (
    <article ref={cardRef} className={cn("bg-bg-card border-b border-border px-4 py-4 transition-all hover:bg-bg-card2 group", deleting && "opacity-40 pointer-events-none scale-[0.98]")}>

      {/* Reshare indicator */}
      {post.reshared_from_id && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
          <Repeat2 size={12} />
          <span>{displayName} reshared</span>
          {post.reshare_comment && (
            <span className="italic text-text-secondary">"{post.reshare_comment}"</span>
          )}
        </div>
      )}

      {/* Room badge */}
      {post.room_id && (
        <div className="mb-2">
          <span className="text-[10px] font-semibold bg-primary-muted text-primary px-2 py-0.5 rounded-full border border-primary/20">
            # Room
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {post.is_anonymous ? (
          <div className="w-10 h-10 rounded-full bg-bg-card2 border border-border flex items-center justify-center text-lg flex-shrink-0">
            🕵️
          </div>
        ) : (
          <Link href={`/profile/${post.user_id}`} className="flex-shrink-0">
            <Avatar user={displayUser} size={40} />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.is_anonymous ? (
              <span className="text-sm font-semibold text-text-secondary">Anonymous</span>
            ) : (
              <Link
                href={`/profile/${post.user_id}`}
                onClick={() => { if (isLoggedIn) fetch('/api/interactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify([{post_id: post.id, action: 'profile_tap'}]), keepalive: true }).catch(()=>{}) }}
                className="text-sm font-semibold hover:text-primary transition-colors truncate">
                {displayName}
              </Link>
            )}
            {displayUser?.is_verified && (
              <span className="text-primary text-xs">✓</span>
            )}
            {post.is_mystery && (
              <span className="text-[10px] font-semibold bg-primary-muted text-primary px-1.5 py-0.5 rounded-full border border-primary/20">🎭 Mystery</span>
            )}
          </div>
          {statusLine && (
            <p className="text-xs text-primary/80 mt-0.5 truncate">{statusLine}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
            <span>{getRelativeTime(post.created_at)}</span>
            {post.distance_km != null && (
              <span className="flex items-center gap-0.5"><MapPin size={10} />{formatDistance(post.distance_km)}</span>
            )}
            {(post as any).social_context === 'following' && (
              <span className="text-primary font-semibold">· Following</span>
            )}
            {(post as any).social_context === 'mutual' && (
              <span className="text-accent-green font-semibold">· Friend</span>
            )}
            {post.city && !post.distance_km && (
              <span className="flex items-center gap-0.5"><MapPin size={10} />{post.city}</span>
            )}
            {post.view_count > 0 && (
              <span className="flex items-center gap-0.5"><Eye size={10} />{post.view_count}</span>
            )}
          </div>
        </div>
        {/* Menu */}
        <div className="relative ml-auto">
          <button onClick={() => setShowMenu(m => !m)}
            className="p-1.5 rounded-full hover:bg-bg-card2 transition-colors text-text-muted opacity-0 group-hover:opacity-100">
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-bg-card border border-border rounded-xl shadow-xl z-30 min-w-[140px] py-1 overflow-hidden">
              <button onClick={handleShare} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-text-secondary">
                <Share2 size={14} /> Share
              </button>
              {isOwner ? (
                <button onClick={handleDelete} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-accent-red">
                  🗑️ Delete
                </button>
              ) : (
                <>
                  <button onClick={handleHide} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-text-secondary">
                    🙈 Hide post
                  </button>
                  <button onClick={() => handleFeedback('less')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-text-secondary">
                    👎 See less like this
                  </button>
                  <button onClick={() => handleFeedback('more')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-text-secondary">
                    👍 See more like this
                  </button>
                  <button onClick={handleReport} className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-card2 flex items-center gap-2.5 text-text-secondary">
                    <Flag size={14} /> Report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mystery content */}
      {isMysteryHidden ? (
        <div className="mb-3">
          <p className="text-sm text-text-secondary leading-relaxed mb-3 blur-[6px] select-none pointer-events-none">
            {"Something hidden is waiting for you here... a secret, a confession, something you've never heard before..."}
          </p>
          <div className="text-center">
            <p className="text-xs text-text-muted mb-2">
              <Eye size={11} className="inline mr-1" />{post.reveal_count} revealed
            </p>
            <button
              onClick={handleReveal}
              disabled={revealing}
              className="bg-gradient-to-r from-primary to-accent-red text-white text-xs font-bold px-5 py-2 rounded-full hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
            >
              {revealing ? 'Revealing…' : '👁️ Tap to reveal'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {localContent && (
            <p className="text-sm leading-relaxed mb-3 text-text break-words whitespace-pre-wrap">{localContent}</p>
          )}
          {/* GIF display */}
          {!!(post as any).gif_url && (
            <div className="relative w-full rounded-xl overflow-hidden mb-3 bg-bg-card2">
              <img src={String((post as any).gif_url)} alt="GIF"
                className="w-full max-h-64 object-cover rounded-xl" loading="lazy" decoding="async"/>
              <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">GIF</span>
            </div>
          )}
          {localImage && (
            <div className="relative w-full rounded-xl overflow-hidden mb-3">
              <ProgressiveImage src={localImage} alt="Post image" priority={priority} className="rounded-xl" />
            </div>
          )}
          {localVideo && (
            <div className="relative w-full rounded-xl overflow-hidden mb-3 bg-black">
              <video src={localVideo}
                poster={(post as any).video_thumbnail_url ? getOptimizedUrl((post as any).video_thumbnail_url, 'feed') : undefined}
                controls preload="none" playsInline className="w-full rounded-xl max-h-80"
                style={{ aspectRatio: '16/9', background: '#000' }} />
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">🎬</div>
            </div>
          )}
        </>
      )}

      {/* Tags */}
      {(post.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.tags.map(tag => (
            <Link key={tag} href={`/search?q=${encodeURIComponent('#' + tag)}`}
              onClick={() => trackTagTap(post.id, tag)}
              className="text-xs text-primary bg-primary-muted px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors">
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Reshare count */}
      {(post.reshare_count ?? 0) > 0 && (
        <p className="text-xs text-text-muted mb-2 flex items-center gap-1">
          <Repeat2 size={11} /> {post.reshare_count} reshare{post.reshare_count !== 1 ? 's' : ''}
        </p>
      )}

      {/* Reactions + actions */}
      <div className="flex items-center gap-1.5 pt-3 border-t border-border flex-wrap">
        {(Object.entries(REACTION_CONFIG) as [ReactionType, typeof REACTION_CONFIG[ReactionType]][]).map(([type, cfg]) => {
          // Prefer live realtime counts over stale SWR data
          const count = (liveCounts as any)?.reaction_counts?.[type] ?? post.reaction_counts?.[type] ?? 0
          const isActive = post.user_reaction === type
          return (
            <button key={type} onClick={() => handleReact(type)} title={cfg.label}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95',
                reactingType === type && 'animate-pop',
                isActive
                  ? `bg-primary-muted border-primary ${cfg.color}`
                  : 'bg-transparent border-border text-text-secondary hover:border-border-active hover:text-text'
              )}>
              <span>{cfg.emoji}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          )
        })}
        <div className="flex-1 min-w-[8px]" />
        <Link href={`/post/${post.id}`}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors px-2 py-1.5">
          <MessageCircle size={14} />
          {(liveCounts?.comment_count ?? post.comment_count ?? 0) > 0 && <span>{liveCounts?.comment_count ?? post.comment_count ?? 0}</span>}
        </Link>
        <button onClick={handleReshare}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors px-2 py-1.5"
          title="Reshare">
          <Repeat2 size={14} />
          {(post.reshare_count ?? 0) > 0 && <span>{post.reshare_count}</span>}
        </button>
        <button onClick={handleShare}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors px-2 py-1.5">
          <Share2 size={14} />
        </button>
        <button onClick={handleBookmark}
          className={cn("flex items-center gap-1 text-xs transition-colors px-2 py-1.5",
            bookmarked ? "text-primary" : "text-text-muted hover:text-text")}
          disabled={bookmarkLoading}>
          <Bookmark size={14} className={bookmarked ? "fill-primary" : ""} />
        </button>
      </div>
    </article>
  )
})

export default FeedCard
