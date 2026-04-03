'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import useSWR from 'swr'
import Link from 'next/link'
import { TrendingUp, Star } from 'lucide-react'
import {} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { LEVEL_CONFIG, type UserLevel, type UserPoints } from '@/types'
import { cn } from '@/lib/utils'

// Displays user_points, level progress, and weekly points
export default function PointsWidget() {
  const { profile, isLoggedIn } = useAuth()
  const { data } = useSWR<{ data: UserPoints }>(
    isLoggedIn && profile?.id ? `/api/users/${profile.id}/points` : null,
    fetcher,
    { refreshInterval: 60000 }
  )

  const points = data?.data
  if (!points || !isLoggedIn) return null

  const level = (points.level as UserLevel) || 'curious_newcomer'
  const cfg = LEVEL_CONFIG[level]

  // Calculate progress to next level
  const levels: UserLevel[] = ['curious_newcomer', 'story_seeker', 'mystery_maker', 'hushly_legend']
  const currentIdx = levels.indexOf(level)
  const nextLevel = levels[currentIdx + 1]
  const nextCfg = nextLevel ? LEVEL_CONFIG[nextLevel] : null
  const progressPct = nextCfg
    ? Math.min(100, Math.round(((points.total_points - cfg.minPoints) / (nextCfg.minPoints - cfg.minPoints)) * 100))
    : 100

  return (
    <Link href="/leaderboard" className="block glass-card px-4 py-3 hover:border-border-active transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.emoji}</span>
          <div>
            <p className={cn('text-xs font-bold', cfg.color)}>{cfg.label}</p>
            <p className="text-[10px] text-text-muted">{points.total_points.toLocaleString()} total points</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-primary font-semibold">
          <TrendingUp size={12} />
          +{points.weekly_points} this week
        </div>
      </div>
      {nextCfg && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
            <span>{progressPct}% to {nextCfg.emoji} {nextCfg.label}</span>
            <span>{nextCfg.minPoints - points.total_points} pts needed</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent-red transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
      {!nextCfg && (
        <div className="flex items-center gap-1 text-xs text-accent-yellow font-semibold">
          <Star size={12} /> Max level reached! 👑
        </div>
      )}
    </Link>
  )
}
