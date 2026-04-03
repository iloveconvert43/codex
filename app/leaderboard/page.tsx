'use client'

import { swrFetcher as fetcher } from '@/lib/api'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Trophy, ArrowLeft, Star, TrendingUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import { LEVEL_CONFIG, type UserLevel } from '@/types'
import { cn } from '@/lib/utils'

const RANK_STYLES = [
  'text-accent-yellow font-black text-lg',
  'text-text-secondary font-bold',
  'text-orange-400 font-bold',
]

const WEEKLY_REWARDS = [
  { rank: '🥇 #1', reward: '+500 Bonus Points + Hushly Legend Badge', color: 'text-yellow-400' },
  { rank: '🥈 Top 3', reward: '+200 Bonus Points', color: 'text-gray-400' },
  { rank: '🏅 Top 10', reward: '+100 Bonus Points', color: 'text-orange-400' },
]

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'weekly' | 'all'>('weekly')
  const { profile } = useAuth()

  const { data, isLoading } = useSWR(
    `/api/leaderboard?period=${period}`,
    fetcher,
    { refreshInterval: 60000 }
  )

  const entries: any[] = (data as any)?.data ?? []
  const myEntry: any = (data as any)?.my_entry

  const Inner = (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* Period toggle */}
      <div className="flex gap-2 mb-6">
        {(['weekly', 'all'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
              period === p
                ? 'bg-primary-muted border-primary text-primary'
                : 'bg-transparent border-border text-text-secondary')}>
            {p === 'weekly' ? '📅 This Week' : '🏆 All Time'}
          </button>
        ))}
      </div>

      {/* My rank (if not in top) */}
      {myEntry && !entries.some(e => e.is_me) && (
        <div className="glass-card px-4 py-3 mb-4 border-primary/30 bg-primary-muted/20">
          <div className="flex items-center gap-3">
            <span className="text-primary font-bold w-8">#{myEntry.rank}</span>
            <Avatar user={profile} size={36} />
            <div className="flex-1">
              <p className="text-sm font-semibold">{profile?.display_name || profile?.username || 'You'}</p>
              <p className="text-xs text-text-muted">You</p>
            </div>
            <div className="flex items-center gap-1 text-sm font-bold text-primary">
              <Star size={14} /> {myEntry.points.toLocaleString()} pts
            </div>
          </div>
        </div>
      )}

      {/* Top entries */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="glass-card px-4 py-3 animate-pulse flex items-center gap-3">
              <div className="w-8 h-4 bg-bg-card2 rounded" />
              <div className="w-9 h-9 rounded-full bg-bg-card2" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-bg-card2 rounded w-24" />
                <div className="h-2.5 bg-bg-card2 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: any) => {
            const levelCfg = LEVEL_CONFIG[entry.level as UserLevel] || LEVEL_CONFIG.curious_newcomer
            return (
              <div key={entry.user?.id}
                className={cn('glass-card px-4 py-3 flex items-center gap-3 transition-all',
                  entry.is_me ? 'border-primary/40 bg-primary-muted/10' : 'hover:border-border-active')}>
                <span className={cn('w-8 text-center', RANK_STYLES[entry.rank - 1] || 'text-text-muted text-sm font-medium')}>
                  {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}
                </span>
                <Link href={`/profile/${entry.user?.id}`}>
                  <Avatar user={entry.user} size={38} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${entry.user?.id}`} className="hover:text-primary transition-colors">
                    <p className="text-sm font-semibold truncate">
                      {entry.is_me ? `${entry.user?.display_name || 'You'} (You)` : (entry.user?.display_name || entry.user?.username)}
                    </p>
                  </Link>
                  <p className="text-xs text-text-muted flex items-center gap-1">
                    <span>{levelCfg.emoji}</span>
                    <span className={levelCfg.color}>{levelCfg.label}</span>
                    {entry.user?.city && <span>· {entry.user.city}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold text-primary flex-shrink-0">
                  <TrendingUp size={13} />
                  {entry.points.toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {entries.length === 0 && !isLoading && (
        <div className="text-center py-16">
          <Trophy size={40} className="mx-auto text-text-muted opacity-30 mb-3" />
          <p className="text-text-secondary text-sm">No entries yet. Start posting to earn points!</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-accent-yellow" />
              <h1 className="font-bold">Leaderboard</h1>
            </div>
          </div>
        </div>
        <main className="pb-nav">{Inner}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center gap-2">
            <Trophy size={18} className="text-accent-yellow" />
            <h1 className="font-bold">Leaderboard</h1>
          </div>
          {Inner}
        </main>
      </div>
    </div>
  )
}
