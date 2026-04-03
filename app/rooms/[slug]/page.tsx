'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ArrowLeft, Users, Settings, Trophy, Flame, Plus,
  Check, Lock, Link2, Shield, ChevronRight, Loader2
} from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import FeedList from '@/components/feed/FeedList'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { LEVEL_CONFIG, type UserLevel } from '@/types'

type Tab = 'posts' | 'leaderboard' | 'challenge'

function RoomDetailPageInner() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const { isLoggedIn, profile } = useAuth()

  const [tab, setTab] = useState<Tab>('posts')
  const [joining, setJoining] = useState(false)

  const { data: roomData, mutate: mutateRoom } = useSWR(`/api/rooms`, fetcher)
  const rooms: any[] = (roomData as any)?.data ?? []
  const room = rooms.find(r => r.slug === slug)

  const { data: leaderboardData } = useSWR(
    tab === 'leaderboard' ? `/api/rooms/${slug}/leaderboard` : null,
    fetcher
  )
  const { data: challengeData } = useSWR(`/api/rooms/${slug}/challenge`, fetcher)
  const { data: modsData } = useSWR(`/api/rooms/${slug}/moderators`, fetcher)

  const leaderboard: any[] = (leaderboardData as any)?.data ?? []
  const challenge = (challengeData as any)?.data
  const mods: any[] = (modsData as any)?.data ?? []
  const isModerator = mods.some(m => m.user?.id === profile?.id)

  // Auto-use invite code
  useEffect(() => {
    if (!inviteCode || !isLoggedIn || !slug) return
    api.get(`/api/rooms/${slug}/invite?code=${inviteCode}`, { requireAuth: true })
      .then((res: any) => {
        if (res.joined) {
          toast.success(`Joined the room! Welcome 🎉`)
          mutateRoom()
          router.replace(`/rooms/${slug}`)
        }
      }).catch(err => toast.error(getErrorMessage(err)))
  }, [inviteCode, isLoggedIn, slug])

  async function toggleJoin() {
    if (!isLoggedIn) { router.push('/login'); return }
    setJoining(true)
    try {
      const res = await api.post(`/api/rooms/${slug}/join`, {}, { requireAuth: true }) as any
      mutateRoom()
      toast.success(res.joined ? `Joined ${room?.name}!` : `Left ${room?.name}`)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setJoining(false) }
  }

  async function copyInvite() {
    try {
      const res = await api.post(`/api/rooms/${slug}/invite`, { expires_hours: 48 }, { requireAuth: true }) as any
      await navigator.clipboard.writeText(res.invite_url)
      toast.success('Invite link copied! Valid for 48 hours.')
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  if (!room && roomData) {
    return <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-secondary">Room not found</p>
    </div>
  }

  const Content = (
    <div>
      {/* Room header */}
      {room && (
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-muted border border-primary/20 flex items-center justify-center text-3xl flex-shrink-0">
              {room.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{room.name}</h1>
                {room.is_private && (
                  <span className="flex items-center gap-1 text-xs bg-bg-card2 border border-border px-2 py-0.5 rounded-full text-text-muted">
                    <Lock size={10} /> Private
                  </span>
                )}
              </div>
              {room.description && (
                <p className="text-sm text-text-secondary mt-1">{room.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                <span className="flex items-center gap-1"><Users size={11} /> {room.member_count?.toLocaleString()} members</span>
                <span>{room.post_count?.toLocaleString()} posts</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button onClick={toggleJoin} disabled={joining}
              className={cn('flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold border transition-all',
                room.is_member
                  ? 'bg-bg-card2 border-border text-text-secondary hover:border-accent-red hover:text-accent-red'
                  : 'bg-primary border-transparent text-white hover:bg-primary-hover')}>
              {joining ? <Loader2 size={14} className="animate-spin" /> : room.is_member ? <Check size={14} /> : <Plus size={14} />}
              {room.is_member ? 'Joined' : 'Join Room'}
            </button>
            {room.is_member && (
              <button
                onClick={() => { if (confirm('Leave this room?')) toggleJoin() }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border border-transparent text-text-muted hover:border-accent-red/30 hover:text-accent-red transition-all"
              >
                Leave Room
              </button>
            )}
            {room.is_member && (
              <button onClick={copyInvite}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-border text-text-secondary hover:border-primary hover:text-primary transition-all">
                <Link2 size={14} /> Invite
              </button>
            )}
            {isModerator && (
              <Link href={`/rooms/${slug}/settings`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-border text-text-secondary hover:border-border-active transition-all">
                <Settings size={14} /> Manage
              </Link>
            )}
          </div>

          {/* Rules */}
          {room.rules && (
            <div className="mt-3 text-xs text-text-muted bg-bg-card2 rounded-xl px-3 py-2">
              📋 {room.rules}
            </div>
          )}

          {/* Today's challenge banner */}
          {challenge && (
            <div className="mt-3 bg-gradient-to-r from-primary/20 to-accent-red/10 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
                {challenge.emoji} Today's Challenge
              </p>
              <p className="text-sm font-semibold">{challenge.title}</p>
              <p className="text-xs text-text-secondary mt-0.5">{challenge.description}</p>
              <Link href={`/create?room=${room.id}&challenge=${challenge.id}`}
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary hover:underline">
                Participate <ChevronRight size={12} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {[
          { id: 'posts' as Tab, label: 'Posts', icon: '📝' },
          { id: 'leaderboard' as Tab, label: 'Top Contributors', icon: '🏆' },
          { id: 'challenge' as Tab, label: 'Challenge', icon: '🔥' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 py-3 text-xs font-semibold transition-colors border-b-2',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text')}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'posts' && (
        <FeedList filter="room" roomSlug={slug} />
      )}

      {tab === 'leaderboard' && (
        <div className="px-4 py-4 space-y-2">
          <p className="text-xs text-text-muted mb-3">Top contributors this week</p>
          {leaderboard.length === 0 ? (
            <div className="py-16 text-center">
              <Trophy size={32} className="mx-auto text-text-muted opacity-30 mb-3" />
              <p className="text-sm text-text-secondary">No posts yet this week. Be the first!</p>
            </div>
          ) : leaderboard.map((entry: any) => (
            <div key={entry.user?.id} className={cn('glass-card px-4 py-3 flex items-center gap-3',
              entry.is_me ? 'border-primary/30 bg-primary-muted/10' : '')}>
              <span className="w-7 text-center font-bold text-text-muted text-sm">
                {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : `#${entry.rank}`}
              </span>
              <Link href={`/profile/${entry.user?.id}`}>
                <Avatar user={entry.user} size={36} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${entry.user?.id}`} className="text-sm font-semibold hover:text-primary truncate block">
                  {entry.user?.display_name || entry.user?.username}
                  {entry.is_me && <span className="text-primary text-xs ml-1">(You)</span>}
                </Link>
                <p className="text-xs text-text-muted">{entry.post_count} posts</p>
              </div>
              <span className="text-sm font-bold text-primary">{entry.score} pts</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'challenge' && (
        <div className="px-4 py-4">
          {isModerator && (
            <CreateChallengeForm slug={slug} onCreated={() => {}} />
          )}
          {!challenge ? (
            <div className="py-16 text-center">
              <Flame size={32} className="mx-auto text-text-muted opacity-30 mb-3" />
              <p className="text-sm text-text-secondary">No challenge today.</p>
              {isModerator && <p className="text-xs text-text-muted mt-1">Create one above!</p>}
            </div>
          ) : (
            <div className="glass-card p-5">
              <div className="text-3xl mb-3">{challenge.emoji}</div>
              <h2 className="text-lg font-bold mb-2">{challenge.title}</h2>
              <p className="text-sm text-text-secondary mb-4">{challenge.description}</p>
              <Link
                href={`/create?room=${room?.id}&challenge=${challenge.id}`}
                className="btn-primary text-sm py-2.5 inline-flex items-center gap-2">
                <Flame size={16} /> Accept Challenge
              </Link>
            </div>
          )}

          {/* Moderators section */}
          {mods.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield size={12} /> Room Moderators
              </h3>
              <div className="flex flex-wrap gap-2">
                {mods.map((m: any) => (
                  <Link key={m.user?.id} href={`/profile/${m.user?.id}`}
                    className="flex items-center gap-2 bg-bg-card2 border border-border rounded-full px-3 py-1.5 hover:border-border-active transition-all">
                    <Avatar user={m.user} size={20} />
                    <span className="text-xs font-medium">{m.user?.display_name || m.user?.username}</span>
                    <span className="text-[10px] text-primary font-semibold">{m.role}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/rooms" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <h1 className="font-bold truncate">{room?.emoji} {room?.name || slug}</h1>
          </div>
        </div>
        <main className="pb-nav">{Content}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center gap-3">
            <Link href="/rooms" className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
            <h2 className="font-bold">{room?.emoji} {room?.name || slug}</h2>
          </div>
          <div className="max-w-2xl mx-auto">{Content}</div>
        </main>
      </div>
    </div>
  )
}

// Create challenge form (moderators only)
function CreateChallengeForm({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [emoji, setEmoji] = useState('🔥')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!title.trim() || !desc.trim()) { toast.error('Title and description required'); return }
    setLoading(true)
    try {
      await api.post(`/api/rooms/${slug}/challenge`, { title: title.trim(), description: desc.trim(), emoji }, { requireAuth: true })
      toast.success('Challenge created! Members notified.')
      setTitle(''); setDesc(''); setOpen(false)
      onCreated()
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full glass-card px-4 py-3 text-sm text-primary font-semibold flex items-center gap-2 hover:border-primary transition-all mb-4">
      <Plus size={16} /> Create Today's Challenge
    </button>
  )

  return (
    <div className="glass-card p-4 mb-4 border-primary/30">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Flame size={14} /> New Challenge</h4>
      <div className="flex gap-2 mb-3">
        <input value={emoji} onChange={e => setEmoji(e.target.value.slice(0,4))}
          className="input-base w-16 text-center text-xl" placeholder="🔥" />
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Challenge title..." className="input-base flex-1 text-sm" />
      </div>
      <textarea value={desc} onChange={e => setDesc(e.target.value)}
        placeholder="Describe the challenge..." rows={2}
        className="input-base w-full text-sm resize-none mb-3" />
      <div className="flex gap-2">
        <button onClick={submit} disabled={loading}
          className="btn-primary text-sm flex items-center gap-1.5 py-2">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Create
        </button>
        <button onClick={() => setOpen(false)} className="btn-ghost text-sm py-2">Cancel</button>
      </div>
    </div>
  )
}

export default function RoomDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RoomDetailPageInner />
    </Suspense>
  )
}
