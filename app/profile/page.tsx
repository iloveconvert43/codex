'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Globe, GraduationCap, Grid3X3, MapPin, PenSquare } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { cn, getRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { usePendingUserPosts } from '@/hooks/usePendingPosts'
import { mergePostsWithPending } from '@/lib/pendingPosts'
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts'
import ProfileAboutSections from '@/components/profile/ProfileAboutSections'
import ProfileHero from '@/components/profile/ProfileHero'

const BADGE_LABELS: Record<string, string> = {
  streak_7: '🔥 7-Day Streak',
  streak_30: '⚡ 30-Day Creator',
  streak_100: '💎 100-Day Legend',
  top_local: '📍 Top Local',
  mystery_master: '🎭 Mystery Master',
  challenge_champion: '🏆 Challenge Champion',
  early_adopter: '🌱 Early Adopter',
  verified_creator: '✅ Verified Creator',
}

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
          <p className="text-sm text-text-secondary blur-[3px] select-none">Mystery post</p>
        ) : post.content ? (
          <p className="text-sm text-text leading-relaxed line-clamp-3">{post.content}</p>
        ) : null}
        <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
          <span>{getRelativeTime(post.created_at)}</span>
          {displayedReactionCount > 0 && <span>✨ {displayedReactionCount}</span>}
          {displayedCommentCount > 0 && <span>💬 {displayedCommentCount}</span>}
        </div>
      </div>
    </Link>
  )
}

export default function ProfilePage() {
  const { profile, signOut, isLoggedIn, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts')

  useEffect(() => {
    if (!loading && !isLoggedIn) router.push('/login?redirect=/profile')
  }, [loading, isLoggedIn, router])

  const { data: fullData } = useSWR(
    profile?.id ? `/api/users/${profile.id}/full` : null,
    swrFetcher,
    { revalidateOnFocus: true, revalidateOnMount: true, dedupingInterval: 0, refreshInterval: 30000 }
  )
  const { data: extData } = useSWR(
    profile?.id ? `/api/users/extended-profile?user_id=${profile.id}` : null,
    swrFetcher,
    { revalidateOnFocus: false }
  )
  const { data: highlightsData } = useSWR(
    profile?.id ? `/api/stories/highlights?user_id=${profile.id}` : null,
    swrFetcher,
    { revalidateOnFocus: false }
  )
  const pendingPosts = usePendingUserPosts(profile?.id)

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const fd         = fullData?.data
  const ext        = extData?.data
  const highlights = highlightsData?.data || []
  const posts      = mergePostsWithPending(fd?.posts ?? [], pendingPosts)
  const followerCount  = fd?.follower_count  ?? 0
  const followingCount = fd?.following_count ?? 0
  const points     = fd?.points
  const badges: any[] = []
  const displayName = profile.display_name || profile.full_name || profile.username || 'You'
  const currentCity = ext?.current_city || profile.current_city || profile.city
  const coverUrl = ext?.cover_url || profile.cover_url || null
  const pinnedInfo = ext?.pinned_info || profile.pinned_info
  const headline = pinnedInfo && pinnedInfo !== profile.bio ? pinnedInfo : null
  const interestPreviewTags = Array.from(new Set(
    ['music', 'tv_shows', 'movies', 'games', 'sports', 'places', 'hobbies', 'books']
      .flatMap((key) => Array.isArray(ext?.interests?.[key]) ? ext.interests[key] : [])
      .filter(Boolean)
  )).slice(0, 6)
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

  const ProfileContent = () => (
    <div className="pb-nav">
      <ProfileHero
        user={profile}
        coverUrl={coverUrl}
        displayName={displayName}
        username={profile.username}
        bio={profile.bio}
        headline={headline}
        quickFacts={quickFacts}
        interestTags={interestPreviewTags}
        stats={[
          { label: 'Posts', value: posts.length },
          { label: 'Followers', value: followerCount, onClick: () => router.push(`/profile/${profile.id}/followers`) },
          { label: 'Following', value: followingCount, onClick: () => router.push(`/profile/${profile.id}/following`) },
          { label: 'Points', value: points?.total_points || 0, accent: true },
        ]}
        actions={(
          <div className="space-y-2">
            <Link
              href="/profile/edit"
              className="btn-primary w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"
            >
              <PenSquare size={15} />
              Edit Profile
            </Link>
            <p className="text-[11px] text-text-muted text-center sm:text-right">
              Update photos, intro and personal details.
            </p>
          </div>
        )}
      />

      {/* Story highlights */}
      {highlights.length > 0 && (
        <div className="px-4 pt-4">
          <div className="glass-card rounded-[24px] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">Highlights</h2>
              <span className="text-[11px] text-text-muted">Stories worth revisiting</span>
            </div>
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
            {highlights.map((h: any) => (
              <div key={h.id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                  <div className="w-full h-full rounded-full border-2 border-bg overflow-hidden bg-bg-card2">
                    {h.story?.image_url ? (
                      <img src={h.story.image_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl"
                        style={{ background: h.story?.bg_color || '#6C63FF' }}>
                        {h.story?.content?.[0] || '✨'}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-text-secondary truncate max-w-[64px] text-center">
                  {h.title || 'Highlight'}
                </span>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="glass-card rounded-[22px] p-1.5 flex gap-1">
          <button onClick={() => setActiveTab('posts')}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold rounded-2xl transition-colors",
              activeTab === 'posts' ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg-card2")}>
            <Grid3X3 size={15} /> Posts
          </button>
          <button onClick={() => setActiveTab('about')}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold rounded-2xl transition-colors",
              activeTab === 'about' ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg-card2")}>
            <span className="text-sm">📖</span> About
          </button>
        </div>
      </div>

      {/* Posts grid */}
      {activeTab === 'posts' && (
        posts.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-bg-card2 flex items-center justify-center mb-4">
              <Grid3X3 size={24} className="text-text-muted" />
            </div>
            <p className="font-semibold text-sm mb-1">No Posts Yet</p>
            <p className="text-xs text-text-muted">Share your first post!</p>
            <Link href="/create" className="mt-4 text-primary text-sm font-semibold">Create Post →</Link>
          </div>
        ) : (
          <div className="px-4 py-2 space-y-3">
            {posts.map((post: any) => <PostCard key={post.id} post={post} />)}
          </div>
        )
      )}

      {/* About tab */}
      {activeTab === 'about' && (
        <>
          <ProfileAboutSections user={profile} ext={ext} points={points} isOwnProfile />
          <div className="px-4 pb-4 space-y-4">
            {badges.length > 0 && (
              <div className="glass-card p-4 rounded-2xl">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Badges</h3>
                <div className="flex flex-wrap gap-2">
                  {badges.map((b: any) => (
                    <span key={b.badge_type} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full">
                      {BADGE_LABELS[b.badge_type] || b.badge_type}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button onClick={signOut}
              className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors">
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <TopBar />
        <main>
          <ProfileContent />
        </main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto border-x border-border max-w-2xl">
          <ProfileContent />
        </main>
      </div>
    </div>
  )
}
