'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Flame, Users, CheckCircle, Loader2, ArrowLeft,
  Plus, Clock, Lock, Globe, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api, getErrorMessage , swrFetcher } from '@/lib/api'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import FeedCard from '@/components/feed/FeedCard'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import Link from 'next/link'

const SLOT_STYLES: Record<string, { gradient: string; label: string; emoji: string }> = {
  night:     { gradient: 'from-indigo-900/40 to-purple-900/20 border-indigo-500/30', label: 'Night Challenge', emoji: '🌙' },
  morning:   { gradient: 'from-amber-900/30 to-orange-900/20 border-amber-500/30',   label: 'Morning Challenge', emoji: '☀️' },
  afternoon: { gradient: 'from-blue-900/30 to-cyan-900/20 border-blue-500/30',       label: 'Afternoon Challenge', emoji: '🌤️' },
  evening:   { gradient: 'from-orange-900/30 to-red-900/20 border-orange-500/30',    label: 'Evening Challenge', emoji: '🌆' } }

export default function ChallengePage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <h1 className="font-bold flex items-center gap-2">
              <Flame size={18} className="text-orange-400" /> Challenges
            </h1>
          </div>
        </div>
        <main className="pb-nav"><ChallengeContent /></main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-orange-400" />
              <h1 className="font-bold">Challenges</h1>
            </div>
          </div>
          <div className="max-w-2xl mx-auto px-4 py-6">
            <ChallengeContent />
          </div>
        </main>
      </div>
    </div>
  )
}

function ChallengeContent() {
  const router = useRouter()
  const { isLoggedIn, profile } = useAuth()
  const [tzOffset, setTzOffset] = useState(330)  // default IST (UTC+5:30)
  const [showCreate, setShowCreate] = useState(false)
  const [activeTab, setActiveTab] = useState<'daily' | 'community'>('daily')
  const [postView, setPostView] = useState<'recent' | 'top'>('recent')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingChallengeId, setLoadingChallengeId] = useState<string | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)

  // Challenge streak — how many consecutive days participated
  const { data: streakData } = useSWR(
    isLoggedIn ? '/api/challenges/streak' : null,
    swrFetcher, { revalidateOnFocus: false }
  )
  const streak: number       = (streakData as any)?.streak ?? 0
  const longestStreak: number = (streakData as any)?.longest_streak ?? 0
  const [createForm, setCreateForm] = useState({
    title: '', description: '', emoji: '🔥', time_slot: 'allday', is_anonymous: false })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setTzOffset(-new Date().getTimezoneOffset())
  }, [])

  const apiBase = tzOffset !== 0 ? `?offset=${tzOffset}` : ''

  const { data: dailyData, mutate: mutateDailyChallenge } = useSWR(
    tzOffset !== 0 ? `/api/challenges/today${apiBase}` : null, swrFetcher,
    { revalidateOnFocus: false }
  )
  const { data: communityData, mutate: mutateCommunity } = useSWR(
    tzOffset !== 0 ? `/api/challenges/community${apiBase}` : null, swrFetcher,
    { refreshInterval: 60000 }
  )
  const { data: postsData } = useSWR(
    dailyData?.data?.id && dailyData.data.id !== 'fallback'
      ? `/api/challenges/${dailyData.data.id}/posts?view=${postView}`
      : null, swrFetcher)

  const { data: leaderboardData } = useSWR(
    dailyData?.data?.id && dailyData.data.id !== 'fallback' && activeTab === 'daily'
      ? `/api/challenges/${dailyData.data.id}/posts?view=leaderboard`
      : null, swrFetcher, { revalidateOnFocus: false })

  const challenge = dailyData?.data
  const communityChallengees: any[] = (communityData as any)?.data ?? []
  const challengePosts: any[] = (postsData as any)?.data ?? []
  const slot = challenge?.time_context?.slot || 'allday'
  const slotStyle = SLOT_STYLES[slot] || SLOT_STYLES.evening

  async function participate() {
    if (!isLoggedIn) { router.push('/login'); return }
    if (!content.trim()) { toast.error('Write something first!'); return }
    if (!challenge) return

    setLoading(true)
    try {
      // Create the post first
      const postRes = await api.post<{ data: { id: string } }>('/api/posts', {
        content: content.trim(),
        scope: 'global',
        tags: ['challenge', challenge.title?.toLowerCase().replace(/\s+/g, '').slice(0, 20)].filter(Boolean),
        is_anonymous: isAnonymous }, { requireAuth: true })

      if (!postRes.data?.id) throw new Error('Post creation failed')

      // Link to challenge — works for both admin and library challenges
      if (challenge.id !== 'fallback') {
        await api.post('/api/challenges/participate', {
          challenge_id: challenge.id,
          post_id: postRes.data.id }, { requireAuth: true })
      }

      toast.success('Posted! +25 Curiosity Points 🎉')
      setContent('')
      setIsAnonymous(false)
      mutateDailyChallenge()
      // Refresh challenge posts to show the new entry
      mutateDailyChallenge()  // posts will auto-refresh
      void((key: string) => typeof key === 'string' && key.includes('/posts'), undefined, { revalidate: true })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function createChallenge() {
    if (!createForm.title.trim() || !createForm.description.trim()) {
      toast.error('Title and description required')
      return
    }
    setCreating(true)
    try {
      await api.post('/api/challenges/create', createForm, { requireAuth: true })
      toast.success('Challenge created! Others can now participate 🔥')
      setShowCreate(false)
      setCreateForm({ title: '', description: '', emoji: '🔥', time_slot: 'allday', is_anonymous: false })
      mutateCommunity()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function participateCommunity(challengeId: string, postContent: string) {
    if (!isLoggedIn) { router.push('/login'); return }
    if (!postContent.trim()) { toast.error('Write something to participate'); return }

    setLoadingChallengeId(challengeId)
    setLoading(true)
    try {
      const ch = communityChallengees.find((c: any) => c.id === challengeId)
      const chTag = ch?.title?.toLowerCase().replace(/\s+/g, '').slice(0, 20) || 'challenge'
      const postRes = await api.post<{ data: { id: string } }>('/api/posts', {
        content: postContent.trim(),
        scope: 'global',
        tags: ['challenge', chTag] }, { requireAuth: true })

      if (!postRes.data?.id) throw new Error('Post failed')

      await api.post(`/api/challenges/${challengeId}/participate`, {
        post_id: postRes.data.id,
        challenge_type: 'user' }, { requireAuth: true })

      toast.success('Participated! +25 points 🎉')
      mutateCommunity()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingChallengeId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('daily')}
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
            activeTab === 'daily' ? 'bg-primary-muted border-primary text-primary' : 'border-border text-text-secondary')}>
          🔥 Daily Challenge
        </button>
        <button onClick={() => setActiveTab('community')}
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
            activeTab === 'community' ? 'bg-primary-muted border-primary text-primary' : 'border-border text-text-secondary')}>
          👥 Community
        </button>
      </div>

      {/* DAILY TAB */}
      {activeTab === 'daily' && !challenge && tzOffset !== 0 && (
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-bg-card animate-pulse border border-border" />
          <div className="h-28 rounded-xl bg-bg-card animate-pulse border border-border" />
        </div>
      )}
      {activeTab === 'daily' && challenge && (
        <>
          {/* Challenge streak */}
      {isLoggedIn && (
        <div className="glass-card p-3 flex items-center gap-3 border-orange-500/20 bg-orange-500/5">
          <span className="text-2xl">{streak > 0 ? '🔥' : '✨'}</span>
          <div className="flex-1">
            {streak > 0 ? (
              <>
                <p className="text-sm font-bold text-orange-400">{streak}-day streak!</p>
                <p className="text-xs text-text-muted">Keep it up — participate daily!</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-text">Start your streak today!</p>
                <p className="text-xs text-text-muted">Participate daily to build a streak 🔥</p>
              </>
            )}
          </div>
          {streak > 0 && longestStreak > streak && (
            <div className="text-right">
              <p className="text-xs text-text-muted">Best</p>
              <p className="text-sm font-bold text-accent-yellow">{longestStreak}🏆</p>
            </div>
          )}
        </div>
      )}

      {/* Challenge card */}
          <div className={cn('rounded-2xl px-5 py-5 border bg-gradient-to-br', slotStyle.gradient)}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">{slotStyle.emoji}</span>
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{slotStyle.label}</span>
              {challenge.time_context && (
                <span className="text-xs text-white/40">{challenge.time_context.greeting}</span>
              )}
              <button
                onClick={() => {
                  const url = window.location.origin + '/challenge'
                  if (navigator.share) navigator.share({ title: challenge.title, url })
                  else { navigator.clipboard.writeText(url); import('react-hot-toast').then(({default: t}) => t.success('Link copied!')) }
                }}
                className="ml-auto text-white/40 hover:text-white/80 transition-colors"
                title="Share challenge">
                📤
              </button>
            </div>
            <div className="flex gap-4 items-start mb-4">
              <span className="text-4xl flex-shrink-0">{challenge.emoji}</span>
              <div>
                <h2 className="text-xl font-black text-white mb-1">{challenge.title}</h2>
                <p className="text-sm text-white/70 leading-relaxed">{challenge.description}</p>
              </div>
            </div>
            {(challenge.participant_count || 0) > 0 && (
              <p className="text-xs text-white/40 flex items-center gap-1">
                <Users size={11} /> {challenge.participant_count?.toLocaleString()} participating today
              </p>
            )}
          </div>

          {/* Participation form */}
          {!challenge.user_has_participated ? (
            <div className="glass-card p-4">
              <p className="text-sm font-semibold mb-3">Share your response:</p>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={`Your response to "${challenge.title}"...`}
                rows={3}
                maxLength={1000}
                className="input-base resize-none text-sm w-full mb-3"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{content.length}/1000</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAnonymous(a => !a)}
                    className={cn('text-xs px-2.5 py-1.5 rounded-full border transition-all flex items-center gap-1',
                      isAnonymous ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-muted')}>
                    {isAnonymous ? <Lock size={11} /> : <Globe size={11} />}
                    {isAnonymous ? 'Anon' : 'Public'}
                  </button>
                  <button onClick={participate} disabled={loading || !content.trim()}
                    className="btn-primary text-sm flex items-center gap-2 py-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
                    Participate · +25 pts
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-4 flex items-center gap-3 border-green-500/20 bg-green-500/5">
              <CheckCircle size={20} className="text-accent-green" />
              <div>
                <p className="text-sm font-semibold text-accent-green">You participated! 🎉</p>
                <p className="text-xs text-text-muted">+25 Curiosity Points earned</p>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {(leaderboardData as any)?.data?.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-xs font-bold text-accent-yellow uppercase tracking-wider mb-3 flex items-center gap-2">
                🏆 Top responses
              </h3>
              {((leaderboardData as any)?.data || []).slice(0, 3).map((entry: any, i: number) => (
                <div key={entry.post_id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-base flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {entry.display_name?.[0] || entry.username?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{entry.display_name || entry.username}</p>
                    <p className="text-[10px] text-text-muted">
                      {entry.reaction_total} reactions · {entry.comment_total} comments
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* View switcher + posts */}
          {challengePosts.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-muted flex items-center gap-2">
                  <Users size={14} /> Responses ({challengePosts.length})
                </h3>
                <div className="flex gap-1">
                  {(['recent', 'top'] as const).map(v => (
                    <button key={v} onClick={() => setPostView(v)}
                      className={cn('text-xs px-2.5 py-1 rounded-full border transition-all',
                        postView === v ? 'bg-primary-muted border-primary text-primary' : 'border-border text-text-muted')}>
                      {v === 'recent' ? '🕐 Recent' : '🔥 Top'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-text-muted flex items-center gap-1">
                <Clock size={10} /> Showing responses from last 12 hours
              </p>
              {challengePosts.map(post => <FeedCard key={post.id} post={post} />)}
            </>
          )}
        </>
      )}

      {/* COMMUNITY TAB */}
      {activeTab === 'community' && (
        <>
          {/* Create challenge button */}
          {isLoggedIn && (
            <div>
              <button onClick={() => setShowCreate(!showCreate)}
                className="w-full glass-card px-4 py-3 flex items-center gap-3 hover:border-primary transition-all text-left">
                <div className="w-9 h-9 rounded-full bg-primary-muted flex items-center justify-center">
                  <Plus size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Create a Challenge</p>
                  <p className="text-xs text-text-muted">Ask the community something interesting</p>
                </div>
                {showCreate ? <ChevronUp size={16} className="ml-auto text-text-muted" /> : <ChevronDown size={16} className="ml-auto text-text-muted" />}
              </button>

              {showCreate && (
                <div className="glass-card p-4 mt-2 border-primary/20">
                  <div className="flex gap-2 mb-3">
                    <input value={createForm.emoji} onChange={e => setCreateForm(f => ({ ...f, emoji: e.target.value.slice(0, 4) }))}
                      className="input-base w-14 text-center text-xl" placeholder="🔥" />
                    <input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Challenge title..." className="input-base flex-1 text-sm" maxLength={100} />
                  </div>
                  <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What do you want people to share? Be specific..." rows={2}
                    className="input-base w-full text-sm resize-none mb-3" maxLength={300} />

                  <div className="flex gap-2 mb-3">
                    <select value={createForm.time_slot} onChange={e => setCreateForm(f => ({ ...f, time_slot: e.target.value }))}
                      className="input-base text-sm flex-1">
                      <option value="allday">⏰ Anytime</option>
                      <option value="morning">☀️ Morning only</option>
                      <option value="afternoon">🌤️ Afternoon only</option>
                      <option value="evening">🌆 Evening only</option>
                      <option value="night">🌙 Night only</option>
                    </select>
                    <button onClick={() => setCreateForm(f => ({ ...f, is_anonymous: !f.is_anonymous }))}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                        createForm.is_anonymous ? 'border-primary text-primary bg-primary-muted' : 'border-border text-text-secondary')}>
                      {createForm.is_anonymous ? <Lock size={12} /> : <Globe size={12} />}
                      {createForm.is_anonymous ? 'Anonymous' : 'Public'}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={createChallenge} disabled={creating || !createForm.title.trim()}
                      className="btn-primary text-sm flex items-center gap-1.5 py-2">
                      {creating ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
                      Create (valid 24h)
                    </button>
                    <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm py-2">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Community challenges list */}
          {communityChallengees.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">🔥</p>
              <p className="text-sm text-text-secondary">No community challenges right now.</p>
              <p className="text-xs text-text-muted mt-1">Be the first to create one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {communityChallengees.map((ch: any) => (
                <CommunityChallenge
                  key={ch.id} challenge={ch} isLoggedIn={isLoggedIn}
                  onParticipate={(postContent: string) => participateCommunity(ch.id, postContent)}
                  loading={loadingChallengeId === ch.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CommunityChallenge({ challenge, isLoggedIn, onParticipate, loading }: any) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')  // own state — not shared

  // Live countdown — updates every 30 seconds
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const msLeft = Math.max(0, new Date(challenge.expires_at).getTime() - now)
  const hoursLeft = Math.floor(msLeft / 3600000)
  const minsLeft  = Math.floor((msLeft % 3600000) / 60000)
  const timeLeft  = hoursLeft  // keep for compat
  const isEndingSoon = msLeft < 2 * 3600000  // < 2 hours
  const isExpired    = msLeft === 0
  const slot = challenge.time_slot
  const slotStyle = SLOT_STYLES[slot] || {}

  return (
    <div className="glass-card overflow-hidden">
      <button className="w-full text-left p-4" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{challenge.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-bold">{challenge.title}</p>
              {slot !== 'allday' && slotStyle.emoji && (
                <span className="text-xs">{slotStyle.emoji}</span>
              )}
            </div>
            <p className="text-xs text-text-muted line-clamp-2">{challenge.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
              <span className="flex items-center gap-1"><Users size={10} /> {challenge.participant_count}</span>
              <span className={cn("flex items-center gap-1",
                isEndingSoon && "text-accent-red font-semibold animate-pulse",
                isExpired && "text-text-muted")}>
                <Clock size={10} />
                {isExpired ? 'Ended' :
                 hoursLeft === 0 ? `${minsLeft}m left!` :
                 isEndingSoon ? `${hoursLeft}h ${minsLeft}m left!` :
                 `${hoursLeft}h left`}
              </span>
              {!challenge.is_anonymous && challenge.creator && (
                <span>by {challenge.creator.display_name || challenge.creator.username}</span>
              )}
            </div>
          </div>
          {challenge.user_has_participated && (
            <CheckCircle size={16} className="text-accent-green flex-shrink-0 mt-1" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          {!challenge.user_has_participated && isLoggedIn ? (
            <>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder={`Your response to "${challenge.title}"...`}
                rows={2} maxLength={1000}
                className="input-base resize-none text-sm w-full mb-2" />
              <button onClick={() => onParticipate(content)} disabled={loading || !content.trim()}
                className="btn-primary text-sm flex items-center gap-2 py-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
                Participate · +25 pts
              </button>
            </>
          ) : challenge.user_has_participated ? (
            <div className="flex items-center gap-2 py-2 text-accent-green text-sm font-semibold">
              <CheckCircle size={16} /> You participated! +25 pts earned
            </div>
          ) : (
            <p className="text-xs text-text-muted py-2">Sign in to participate</p>
          )}
        </div>
      )}
    </div>
  )
}
