'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ArrowLeft, MessageCircle,
  MapPin, Shield, Grid3X3, MoreHorizontal,
  Briefcase, GraduationCap, Globe
} from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { cn, getRelativeTime } from '@/lib/utils'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { usePendingUserPosts } from '@/hooks/usePendingPosts'
import { mergePostsWithPending } from '@/lib/pendingPosts'
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts'
import ProfileAboutSections from '@/components/profile/ProfileAboutSections'
import ProfileHero from '@/components/profile/ProfileHero'

// ── Story highlight circle ─────────────────────────────────────
function StoryRing({ highlight, onClick }: { highlight: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
        <div className="w-full h-full rounded-full border-2 border-bg overflow-hidden bg-bg-card2">
          {highlight.story?.image_url ? (
            <img src={highlight.story.image_url} className="w-full h-full object-cover" alt="" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl"
              style={{ background: highlight.story?.bg_color || '#6C63FF' }}
            >
              {highlight.story?.content?.[0] || '✨'}
            </div>
          )}
        </div>
      </div>
      <span className="text-[10px] text-text-secondary truncate max-w-[64px] text-center">
        {highlight.title || 'Highlight'}
      </span>
    </button>
  )
}

// ── Facebook-style post card ────────────────────────────────
function PostCard({ post }: { post: any }) {
  const liveCounts = useRealtimePostCounts(post.id, {
    reaction_count: post.reaction_count ?? 0,
    comment_count: post.comment_count ?? 0,
    latest_comment: post.latest_comment ?? null,
  }, { fallbackPollMs: 10000 })
  const statusParts: string[] = []
  if (post.feeling_emoji) statusParts.push(`${post.feeling_emoji} feeling ${post.feeling || ''}`)
  if (post.activity_emoji) statusParts.push(`${post.activity_emoji} ${post.activity || ''}${post.activity_detail ? ' ' + post.activity_detail : ''}`)
  if (post.location_name) statusParts.push(`📍 ${post.location_name}`)
  if (post.is_life_event && post.life_event_emoji) {
    statusParts.push(`${post.life_event_emoji} ${(post.life_event_type || '').replace(/_/g, ' ')}`)
  }
  const statusLine = statusParts.join(' · ')
  const displayedReactionCount = liveCounts.reaction_count ?? post.reaction_count ?? 0
  const displayedCommentCount = liveCounts.comment_count ?? post.comment_count ?? 0

  return (
    <Link href={`/post/${post.id}`}
      className="block bg-bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all group">
      {post.gif_url && !post.image_url && !post.video_url && (
        <div className="w-full max-h-72 overflow-hidden bg-bg-card2">
          <img src={post.gif_url} className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300" alt="" loading="lazy"/>
        </div>
      )}
      {post.image_url && (
        <div className="w-full max-h-72 overflow-hidden bg-bg-card2">
          <img src={post.image_url} className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300" alt="" loading="lazy"/>
        </div>
      )}
      {post.video_url && !post.image_url && (
        <div className="w-full h-40 flex items-center justify-center bg-bg-card2">
          <span className="text-4xl">🎥</span>
        </div>
      )}
      <div className="px-4 py-3">
        {statusLine && <p className="text-xs text-primary mb-1.5">{statusLine}</p>}
        {post.is_mystery ? (
          <p className="text-sm text-text-secondary blur-[3px] select-none">Mystery post content hidden</p>
        ) : post.content ? (
          <p className="text-sm text-text leading-relaxed line-clamp-3">{post.content}</p>
        ) : null}
        <div className="flex items-center gap-4 mt-2.5 text-xs text-text-muted">
          <span>{getRelativeTime(post.created_at)}</span>
          {displayedReactionCount > 0 && <span>✨ {displayedReactionCount}</span>}
          {displayedCommentCount > 0 && <span>💬 {displayedCommentCount}</span>}
          {post.view_count > 0 && <span>👁 {post.view_count}</span>}
        </div>
      </div>
    </Link>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function ProfileDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { profile: myProfile, isLoggedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts')
  const [following, setFollowing] = useState<boolean | null>(null)

  const { data: fullData, mutate, isLoading } = useSWR(
    id ? `/api/users/${id}/full` : null,
    swrFetcher,
    { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 0, errorRetryCount: 2, refreshInterval: 15000 }
  )

  // Realtime follower count updates
  useEffect(() => {
    if (!id) return
    const channel = supabase.channel(`profile-follows:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows',
        filter: `following_id=eq.${id}` }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, mutate])

  const { data: extData } = useSWR(
    id ? `/api/users/extended-profile?user_id=${id}` : null,
    swrFetcher,
    { revalidateOnFocus: false }
  )

  const { data: highlightsData } = useSWR(
    id ? `/api/stories/highlights?user_id=${id}` : null,
    swrFetcher,
    { revalidateOnFocus: false }
  )

  const fd   = fullData?.data
  const ext  = extData?.data
  const highlights = highlightsData?.data || []
  const user           = fd?.user
  const followerCount  = fd?.follower_count  ?? 0
  const followingCount = fd?.following_count ?? 0
  const points         = fd?.points
  const pendingPosts   = usePendingUserPosts(myProfile?.id === id ? String(id) : null)
  const posts          = mergePostsWithPending(fd?.posts ?? [], pendingPosts)
  const isFollowing    = fd?.is_following    ?? false
  const isOwnProfile   = fd?.is_own_profile  ?? (myProfile?.id === id)
  const actualFollowing = following !== null ? following : isFollowing
  const coverUrl = ext?.cover_url || user?.cover_url || null
  const currentCity = ext?.current_city || user?.current_city || user?.city
  const pinnedInfo = ext?.pinned_info || user?.pinned_info
  const interestPreviewTags = Array.from(new Set(
    ['music', 'tv_shows', 'movies', 'games', 'sports', 'places', 'hobbies', 'books']
      .flatMap((key) => Array.isArray(ext?.interests?.[key]) ? ext.interests[key] : [])
      .filter(Boolean)
  )).slice(0, 6)
  const headline = pinnedInfo && pinnedInfo !== user?.bio ? pinnedInfo : null
  const quickFacts = [
    ext?.work?.length > 0 ? (() => {
      const current = ext.work.find((item: any) => item.is_current) || ext.work[0]
      if (!current) return null
      return {
        icon: <Briefcase size={14} />,
        label: `${current.position || current.role || 'Working'}${current.company ? ` at ${current.company}` : ''}`,
      }
    })() : null,
    ext?.education?.length > 0 ? (() => {
      const current = ext.education.find((item: any) => item.is_current) || ext.education[0]
      if (!current) return null
      return {
        icon: <GraduationCap size={14} />,
        label: `${current.degree ? `${current.degree} · ` : ''}${current.school}`,
      }
    })() : null,
    (currentCity || ext?.hometown) ? {
      icon: <MapPin size={14} />,
      label: currentCity && ext?.hometown && currentCity !== ext.hometown
        ? `${currentCity} · From ${ext.hometown}`
        : (currentCity || `From ${ext?.hometown}`),
    } : null,
    ext?.social_instagram ? {
      icon: <Globe size={14} />,
      label: `@${ext.social_instagram}`,
      accent: true,
    } : ext?.relationship_status ? {
      icon: <span className="text-sm">❤️</span>,
      label: String(ext.relationship_status).replace(/_/g, ' '),
    } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; label: string; accent?: boolean }>

  async function handleFollow() {
    if (!isLoggedIn) { router.push('/login'); return }
    const prev = actualFollowing
    setFollowing(!prev)
    try {
      await api.post(`/api/users/${id}/follow`, {}, { requireAuth: true })
      mutate()
    } catch (err) {
      setFollowing(prev)
      toast.error(getErrorMessage(err))
    }
  }

  // ── Loading skeleton ───────────────────────────────────────
  if (isLoading || !fd) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="lg:hidden">
          <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3 safe-top">
            <button onClick={() => router.back()}><ArrowLeft size={20} className="text-text-muted" /></button>
            <div className="h-4 w-32 bg-bg-card2 rounded animate-pulse" />
          </div>
          <div className="animate-pulse">
            <div className="h-32 bg-bg-card2" />
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between -mt-10 mb-4">
                <div className="w-20 h-20 rounded-full bg-bg-card border-4 border-bg" />
              </div>
              <div className="h-5 w-36 bg-bg-card2 rounded mb-2" />
              <div className="h-3 w-24 bg-bg-card2 rounded mb-4" />
              <div className="flex gap-8 mb-4">
                {[0,1,2].map(i => <div key={i} className="h-10 w-16 bg-bg-card2 rounded" />)}
              </div>
            </div>
          </div>
          <BottomNav />
        </div>
      </div>
    )
  }

  if (!user) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-3">👤</p>
        <p className="text-text-muted">User not found</p>
        <button onClick={() => router.back()} className="mt-4 text-primary text-sm">← Go back</button>
      </div>
    </div>
  )

  const displayName = user.display_name || user.full_name || user.username || 'User'

  const ProfileContent = () => (
    <div className="pb-nav">
      <ProfileHero
        user={user}
        coverUrl={coverUrl}
        displayName={displayName}
        username={user.username}
        bio={user.bio}
        headline={headline}
        quickFacts={quickFacts}
        interestTags={interestPreviewTags}
        stats={[
          { label: 'Posts', value: posts.length },
          { label: 'Followers', value: followerCount, onClick: () => router.push(`/profile/${user.id}/followers`) },
          { label: 'Following', value: followingCount, onClick: () => router.push(`/profile/${user.id}/following`) },
          { label: 'Points', value: points?.total_points || 0, accent: true },
        ]}
        actions={isOwnProfile ? (
          <div className="space-y-2">
            <Link
              href="/profile/edit"
              className="btn-primary w-full inline-flex items-center justify-center rounded-2xl py-3 text-sm font-semibold"
            >
              Edit Profile
            </Link>
            <p className="text-[11px] text-text-muted text-center sm:text-right">
              Manage photos and profile details.
            </p>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleFollow}
              className={cn(
                "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold follow-btn-transition",
                actualFollowing
                  ? "border border-border text-text hover:border-accent-red/50 hover:text-accent-red"
                  : "bg-primary text-white hover:bg-primary-hover"
              )}>
              {actualFollowing ? 'Following' : 'Follow'}
            </button>
            {isLoggedIn && (
              <Link href={`/messages?user=${user.id}`}
                className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm">
                <MessageCircle size={16} />
                <span className="hidden sm:inline">Message</span>
              </Link>
            )}
          </div>
        )}
      />

      {/* ── Story highlights ── */}
      {highlights.length > 0 && (
        <div className="px-4 pt-4">
          <div className="glass-card rounded-[24px] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">Highlights</h2>
              <span className="text-[11px] text-text-muted">Pinned story moments</span>
            </div>
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
            {highlights.map((h: any) => (
              <StoryRing key={h.id} highlight={h} onClick={() => {}} />
            ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="px-4 pt-4">
        <div className="glass-card rounded-[22px] p-1.5 flex gap-1">
        <button
          onClick={() => setActiveTab('posts')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold rounded-2xl transition-colors",
            activeTab === 'posts'
              ? "bg-primary/10 text-primary"
              : "text-text-muted hover:bg-bg-card2 hover:text-text"
          )}>
          <Grid3X3 size={15} /> Posts
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold rounded-2xl transition-colors",
            activeTab === 'about'
              ? "bg-primary/10 text-primary"
              : "text-text-muted hover:bg-bg-card2 hover:text-text"
          )}>
          <span className="text-sm">📖</span> About
        </button>
        </div>
      </div>

      {/* ── Posts grid tab ── */}
      {activeTab === 'posts' && (
        <>
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-bg-card2 flex items-center justify-center mb-4">
                <Grid3X3 size={24} className="text-text-muted" />
              </div>
              <p className="font-semibold text-sm mb-1">No Posts Yet</p>
              <p className="text-xs text-text-muted">
                {isOwnProfile ? "Share your first post!" : `${displayName} hasn't posted yet`}
              </p>
              {isOwnProfile && (
                <Link href="/create" className="mt-4 text-primary text-sm font-semibold">
                  Create Post →
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/30 px-0">
              {posts.map((post: any) => (
                <div key={post.id} className="px-4 py-3">
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── About tab ── */}
      {activeTab === 'about' && (
        <ProfileAboutSections user={user} ext={ext} points={points} isOwnProfile={isOwnProfile} />
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      {/* Mobile */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3 safe-top">
          <button onClick={() => router.back()} className="text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold truncate flex-1">{displayName}</h1>
          {user.is_verified && <Shield size={16} className="text-primary" />}
          <button className="text-text-muted hover:text-text">
            <MoreHorizontal size={20} />
          </button>
        </div>
        <ProfileContent />
        <BottomNav />
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto border-x border-border max-w-2xl">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-text-muted hover:text-text">
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-bold">{displayName}</h1>
          </div>
          <ProfileContent />
        </main>
      </div>
    </div>
  )
}
