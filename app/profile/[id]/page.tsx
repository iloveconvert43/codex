'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, UserPlus, UserCheck, MessageCircle,
  MapPin, Shield, Grid3X3, BookOpen, MoreHorizontal,
  ChevronRight, Briefcase, GraduationCap, Globe
} from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { cn, getRelativeTime } from '@/lib/utils'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import Avatar from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

// ── Avatar component ──────────────────────────────────────────
function ProfileAvatar({ user, size = 86 }: { user: any; size?: number }) {
  const s = `${size}px`
  const gradients = [
    'from-violet-500 to-purple-600',
    'from-pink-500 to-rose-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
  ]
  const grad = gradients[(user?.id?.charCodeAt(0) || 0) % gradients.length]
  const initials = (user?.display_name || user?.username || '?')[0]?.toUpperCase()

  if (user?.avatar_url) {
    return (
      <Image
        src={user.avatar_url}
        alt={user.display_name || 'User'}
        width={size} height={size}
        className="rounded-full object-cover"
        style={{ width: s, height: s }}
      />
    )
  }
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold`}
      style={{ width: s, height: s, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

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
  const statusParts: string[] = []
  if (post.feeling_emoji) statusParts.push(`${post.feeling_emoji} feeling ${post.feeling || ''}`)
  else if (post.activity_emoji) statusParts.push(`${post.activity_emoji} ${post.activity || ''}${post.activity_detail ? ' ' + post.activity_detail : ''}`)
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
          <p className="text-sm text-text-secondary blur-[3px] select-none">Mystery post content hidden</p>
        ) : post.content ? (
          <p className="text-sm text-text leading-relaxed line-clamp-3">{post.content}</p>
        ) : null}
        <div className="flex items-center gap-4 mt-2.5 text-xs text-text-muted">
          <span>{getRelativeTime(post.created_at)}</span>
          {(post.reaction_count ?? 0) > 0 && <span>✨ {post.reaction_count}</span>}
          {(post.comment_count ?? 0) > 0 && <span>💬 {post.comment_count}</span>}
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
    { revalidateOnFocus: true, errorRetryCount: 2, refreshInterval: 15000 }
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
  const posts          = fd?.posts ?? []
  const isFollowing    = fd?.is_following    ?? false
  const isOwnProfile   = fd?.is_own_profile  ?? (myProfile?.id === id)
  const actualFollowing = following !== null ? following : isFollowing

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
      {/* ── Cover photo ── */}
      <div className="relative h-36 bg-gradient-to-br from-primary/40 via-accent-red/20 to-accent-yellow/10 overflow-hidden">
        {user.cover_url && (
          <img src={user.cover_url} className="w-full h-full object-cover" alt="" loading="lazy" />
        )}
        {/* Dark gradient at bottom for avatar overlap */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-bg/80 to-transparent" />
      </div>

      {/* ── Avatar + Actions row ── */}
      <div className="px-4 -mt-10 flex items-end justify-between mb-3">
        <div className="relative">
          <div className="ring-4 ring-bg rounded-full">
            <ProfileAvatar user={user} size={86} />
          </div>
          {user.is_verified && (
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-bg">
              <Shield size={11} className="text-white" />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pb-1">
          {isOwnProfile ? (
            <Link href="/settings"
              className="px-5 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-bg-card2 transition-colors">
              Edit Profile
            </Link>
          ) : (
            <>
              <button onClick={handleFollow}
                className={cn(
                  "px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                  actualFollowing
                    ? "border border-border text-text hover:border-accent-red/50 hover:text-accent-red"
                    : "bg-primary text-white hover:bg-primary-hover"
                )}>
                {actualFollowing ? 'Following' : 'Follow'}
              </button>
              {isLoggedIn && (
                <Link href={`/messages?user=${user.id}`}
                  className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-bg-card2 transition-colors">
                  <MessageCircle size={17} className="text-text-muted" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Name + bio ── */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <h1 className="text-lg font-bold">{displayName}</h1>
        </div>
        {user.username && (
          <p className="text-sm text-text-muted mb-1">@{user.username}</p>
        )}
        {user.bio && (
          <p className="text-sm text-text leading-relaxed mb-2">{user.bio}</p>
        )}

        {/* Instagram-style details strip below bio */}
        <div className="flex flex-col gap-1.5 mb-2">
          {/* Current job — like Instagram shows company */}
          {ext?.work?.length > 0 && (() => {
            const current = ext.work.find((w: any) => w.is_current) || ext.work[0]
            return current ? (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Briefcase size={11} className="text-text-muted flex-shrink-0" />
                <span>{current.position || current.role}{current.company ? ` at ${current.company}` : ''}</span>
              </span>
            ) : null
          })()}
          {/* Education — like Instagram shows school */}
          {ext?.education?.length > 0 && (() => {
            const current = ext.education.find((e: any) => e.is_current) || ext.education[0]
            return current ? (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <GraduationCap size={11} className="text-text-muted flex-shrink-0" />
                <span>{current.degree ? `${current.degree} — ` : ''}{current.school}</span>
              </span>
            ) : null
          })()}
          {/* City */}
          {(user.city || ext?.hometown) && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <MapPin size={11} className="text-text-muted flex-shrink-0" />
              <span>
                {user.city}{user.city && ext?.hometown && user.city !== ext.hometown ? ` · From ${ext.hometown}` : ''}
                {!user.city && ext?.hometown ? `From ${ext.hometown}` : ''}
              </span>
            </span>
          )}
          {/* Relationship status */}
          {ext?.relationship_status && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="text-text-muted flex-shrink-0">❤️</span>
              <span className="capitalize">{ext.relationship_status.replace(/_/g, ' ')}</span>
            </span>
          )}
          {/* Website / social */}
          {ext?.social_instagram && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Globe size={11} className="flex-shrink-0" />
              <span>@{ext.social_instagram}</span>
            </span>
          )}
        </div>

        {/* Interest tags — Instagram style */}
        {ext?.interests?.topics?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {ext.interests.topics.slice(0, 6).map((t: string, i: number) => (
              <span key={i} className="text-[10px] bg-primary/8 text-primary px-2 py-0.5 rounded-full font-medium">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="flex border-y border-border mx-0 mb-0">
        <div className="flex-1 py-3 text-center">
          <p className="font-bold text-base">{posts.length}</p>
          <p className="text-[11px] text-text-muted">Posts</p>
        </div>
        <button onClick={() => router.push(`/profile/${user.id}/followers`)}
          className="flex-1 py-3 text-center hover:bg-bg-card/50 transition-colors">
          <p className="font-bold text-base">{followerCount}</p>
          <p className="text-[11px] text-text-muted">Followers</p>
        </button>
        <button onClick={() => router.push(`/profile/${user.id}/following`)}
          className="flex-1 py-3 text-center hover:bg-bg-card/50 transition-colors">
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

      {/* ── Story highlights ── */}
      {highlights.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
            {highlights.map((h: any) => (
              <StoryRing key={h.id} highlight={h} onClick={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('posts')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2",
            activeTab === 'posts'
              ? "border-text text-text"
              : "border-transparent text-text-muted hover:text-text"
          )}>
          <Grid3X3 size={15} /> Posts
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2",
            activeTab === 'about'
              ? "border-text text-text"
              : "border-transparent text-text-muted hover:text-text"
          )}>
          <BookOpen size={15} /> About
        </button>
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
        <div className="px-4 py-4 space-y-4">
          {/* Basic info */}
          <div className="glass-card p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Basic Info</h3>
            {user.city && (
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-primary flex-shrink-0" />
                <span className="text-sm">{user.city}</span>
              </div>
            )}
            {ext?.hometown && (
              <div className="flex items-center gap-3">
                <span className="text-base flex-shrink-0">🏡</span>
                <span className="text-sm">From {ext.hometown}</span>
              </div>
            )}
            {ext?.relationship_status && (
              <div className="flex items-center gap-3">
                <span className="text-base flex-shrink-0">❤️</span>
                <span className="text-sm capitalize">{ext.relationship_status.replace('_', ' ')}</span>
              </div>
            )}
            {ext?.pronouns && (
              <div className="flex items-center gap-3">
                <span className="text-base flex-shrink-0">👤</span>
                <span className="text-sm">{ext.pronouns}</span>
              </div>
            )}
            {points && (
              <div className="flex items-center gap-3">
                <span className="text-base flex-shrink-0">⭐</span>
                <span className="text-sm">Level: <span className="text-primary font-semibold capitalize">{(points.level || 'newcomer').replace(/_/g, ' ')}</span></span>
              </div>
            )}
          </div>

          {/* Work */}
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

          {/* Education */}
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

          {/* Interests */}
          {ext?.interests?.topics?.length > 0 && (
            <div className="glass-card p-4 rounded-2xl">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {ext.interests.topics.map((t: string, i: number) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social links */}
          {(ext?.social_instagram || ext?.social_twitter || ext?.social_linkedin) && (
            <div className="glass-card p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Social</h3>
              {ext.social_instagram && (
                <div className="flex items-center gap-3">
                  <span className="text-base">📸</span>
                  <span className="text-sm text-primary">@{ext.social_instagram}</span>
                </div>
              )}
              {ext.social_twitter && (
                <div className="flex items-center gap-3">
                  <span className="text-base">🐦</span>
                  <span className="text-sm text-primary">@{ext.social_twitter}</span>
                </div>
              )}
              {ext.social_linkedin && (
                <div className="flex items-center gap-3">
                  <span className="text-base">💼</span>
                  <span className="text-sm text-primary">{ext.social_linkedin}</span>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!user.city && !ext?.hometown && !ext?.work?.length && !ext?.education?.length && !ext?.interests?.topics?.length && (
            <div className="text-center py-10 text-text-muted">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm">No details yet</p>
              {isOwnProfile && (
                <Link href="/settings" className="text-xs text-primary mt-2 inline-block">
                  Add details →
                </Link>
              )}
            </div>
          )}
        </div>
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
