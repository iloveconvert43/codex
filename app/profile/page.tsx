'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Grid3X3, BookOpen, LogOut, Edit3,
         Briefcase, GraduationCap, MapPin, Globe } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { cn, getRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'
import TopBar from '@/components/layout/TopBar'
import { usePendingUserPosts } from '@/hooks/usePendingPosts'
import { mergePostsWithPending } from '@/lib/pendingPosts'

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

function OwnAvatar({ profile, size = 86 }: { profile: any; size?: number }) {
  const s = `${size}px`
  const gradients = ['from-violet-500 to-purple-600','from-pink-500 to-rose-500','from-blue-500 to-cyan-500','from-emerald-500 to-teal-500','from-orange-500 to-amber-500']
  const grad = gradients[(profile?.id?.charCodeAt(0) || 0) % gradients.length]
  const initials = (profile?.display_name || profile?.username || '?')[0]?.toUpperCase()
  if (profile?.avatar_url) {
    return <Image src={profile.avatar_url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: s, height: s }} />
  }
  return (
    <div className={`rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold`}
      style={{ width: s, height: s, fontSize: size * 0.38 }}>
      {initials}
    </div>
  )
}

function PostCard({ post }: { post: any }) {
  const statusParts: string[] = []
  if (post.feeling_emoji) statusParts.push(`${post.feeling_emoji} feeling ${post.feeling || ''}`)
  if (post.activity_emoji) statusParts.push(`${post.activity_emoji} ${post.activity || ''}${post.activity_detail ? ' ' + post.activity_detail : ''}`)
  if (post.location_name) statusParts.push(`📍 ${post.location_name}`)
  if (post.is_life_event && post.life_event_emoji) {
    statusParts.push(`${post.life_event_emoji} ${(post.life_event_type || '').replace(/_/g, ' ')}`)
  }
  const statusLine = statusParts.join(' · ')

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
          {(post.reaction_count ?? 0) > 0 && <span>✨ {post.reaction_count}</span>}
          {(post.comment_count ?? 0) > 0 && <span>💬 {post.comment_count}</span>}
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
    { revalidateOnFocus: true, refreshInterval: 30000 }
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

  const ProfileContent = () => (
    <div className="pb-nav">
      {/* Cover */}
      <div className="relative h-36 bg-gradient-to-br from-primary/40 via-accent-red/20 to-accent-yellow/10 overflow-hidden">
        {profile.cover_url && (
          <img src={profile.cover_url} className="w-full h-full object-cover" alt="" />
        )}
      </div>

      {/* Avatar + actions */}
      <div className="px-4 -mt-10 flex items-end justify-between mb-3">
        <div className="ring-4 ring-bg rounded-full">
          <OwnAvatar profile={profile} size={86} />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Link href="/profile/edit"
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-bg-card2 transition-colors">
            <Edit3 size={16} className="text-text-muted" />
          </Link>
          <Link href="/settings"
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-bg-card2 transition-colors">
            <Settings size={16} className="text-text-muted" />
          </Link>
          <button onClick={signOut}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 transition-colors">
            <LogOut size={16} className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="px-4 mb-4">
        <h1 className="text-lg font-bold">{displayName}</h1>
        {profile.username && <p className="text-sm text-text-muted">@{profile.username}</p>}
        {profile.bio && <p className="text-sm text-text leading-relaxed mt-1">{profile.bio}</p>}
        {profile.city && (
          <span className="flex items-center gap-1 text-xs text-text-muted mt-1">
            <MapPin size={11} /> {profile.city}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex border-y border-border">
        <div className="flex-1 py-3 text-center">
          <p className="font-bold text-base">{posts.length}</p>
          <p className="text-[11px] text-text-muted">Posts</p>
        </div>
        <button onClick={() => router.push(`/profile/${profile.id}/followers`)}
          className="flex-1 py-3 text-center hover:bg-bg-card/50">
          <p className="font-bold text-base">{followerCount}</p>
          <p className="text-[11px] text-text-muted">Followers</p>
        </button>
        <button onClick={() => router.push(`/profile/${profile.id}/following`)}
          className="flex-1 py-3 text-center hover:bg-bg-card/50">
          <p className="font-bold text-base">{followingCount}</p>
          <p className="text-[11px] text-text-muted">Following</p>
        </button>
        {points && (
          <div className="flex-1 py-3 text-center">
            <p className="font-bold text-base gradient-text">{points.total_points || 0}</p>
            <p className="text-[11px] text-text-muted">Points</p>
          </div>
        )}
      </div>

      {/* Story highlights */}
      {highlights.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
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
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button onClick={() => setActiveTab('posts')}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors",
            activeTab === 'posts' ? "border-text text-text" : "border-transparent text-text-muted")}>
          <Grid3X3 size={15} /> Posts
        </button>
        <button onClick={() => setActiveTab('about')}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors",
            activeTab === 'about' ? "border-text text-text" : "border-transparent text-text-muted")}>
          <BookOpen size={15} /> About
        </button>
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
        <div className="px-4 py-4 space-y-4">
          <div className="glass-card p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Basic Info</h3>
            {profile.city && (
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-primary" />
                <span className="text-sm">{profile.city}</span>
              </div>
            )}
            {ext?.hometown && (
              <div className="flex items-center gap-3">
                <span className="text-base">🏡</span>
                <span className="text-sm">From {ext.hometown}</span>
              </div>
            )}
            {points && (
              <div className="flex items-center gap-3">
                <span className="text-base">⭐</span>
                <span className="text-sm">Level: <span className="text-primary font-semibold capitalize">{(points.level || 'newcomer').replace(/_/g,' ')}</span></span>
              </div>
            )}
          </div>
          {ext?.work?.length > 0 && (
            <div className="glass-card p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Work</h3>
              {ext.work.map((w: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <Briefcase size={15} className="text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{w.position || w.role}</p>
                    <p className="text-xs text-text-muted">{w.company}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {ext?.education?.length > 0 && (
            <div className="glass-card p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Education</h3>
              {ext.education.map((e: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <GraduationCap size={15} className="text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{e.school}</p>
                    <p className="text-xs text-text-muted">{e.degree}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <div className="pt-2">
            <button onClick={signOut}
              className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
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
