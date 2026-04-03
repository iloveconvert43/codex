'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * ChallengeCard — Time-aware daily challenge banner
 *
 * Sends user's timezone offset to API so the right challenge
 * for the time of day is shown:
 *   🌙 Night    22:00 - 04:59
 *   ☀️ Morning  05:00 - 10:59
 *   🌤️ Afternoon 11:00 - 16:59
 *   🌆 Evening  17:00 - 21:59
 */
export default function ChallengeCard() {
  const [apiUrl, setApiUrl] = useState<string | null>(null)

  // Build URL with user's timezone offset on client side
  useEffect(() => {
    // getTimezoneOffset() returns minutes BEHIND UTC (negative for east of UTC)
    // e.g. IST (UTC+5:30) returns -330 → we negate it for the API
    const offsetMin = -new Date().getTimezoneOffset() // now positive for east
    setApiUrl(`/api/challenges/today?offset=${offsetMin}`)
  }, [])

  const { data, isLoading } = useSWR(
    apiUrl,
    fetcher,
    {
      refreshInterval: 60 * 60 * 1000, // re-check every hour (slot may change)
      revalidateOnFocus: false }
  )

  const challenge = (data as any)?.data
  const timeCtx = challenge?.time_context

  if (isLoading) {
    return (
      <div className="mx-3 my-2.5 h-20 rounded-2xl bg-bg-card animate-pulse border border-border" />
    )
  }

  if (!challenge) return null

  // Don't show if user already participated
  if (challenge.user_has_participated) return null

  // Slot-based gradient colors
  const gradients: Record<string, string> = {
    night:     'from-indigo-900/40 to-purple-900/20 border-indigo-500/30',
    morning:   'from-amber-900/30 to-orange-900/20 border-amber-500/30',
    afternoon: 'from-blue-900/30 to-cyan-900/20 border-blue-500/30',
    evening:   'from-orange-900/30 to-red-900/20 border-orange-500/30' }
  const gradient = gradients[timeCtx?.slot] || 'from-primary/20 to-red/10 border-primary/30'

  return (
    <Link
      href="/challenge"
      className={cn(
        'block mx-3 my-2.5 rounded-2xl px-4 py-3.5 border bg-gradient-to-br',
        gradient,
        'hover:scale-[1.01] transition-transform active:scale-[0.99]'
      )}
    >
      {/* Time context label */}
      {timeCtx && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm">{timeCtx.slot_emoji}</span>
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
            {timeCtx.greeting}
          </span>
        </div>
      )}

      {/* Challenge content */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0 mt-0.5">{challenge.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Today's Challenge
            </span>
          </div>
          <p className="text-sm font-bold text-white leading-snug mb-1">
            {challenge.title}
          </p>
          <p className="text-xs text-white/60 leading-relaxed line-clamp-2">
            {challenge.description}
          </p>
        </div>
      </div>

      {/* Participant count */}
      {challenge.participant_count > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {['🌟','✨','💫'].map((e, i) => (
              <span key={i} className="text-xs">{e}</span>
            ))}
          </div>
          <span className="text-[10px] text-white/50 font-medium">
            {challenge.participant_count.toLocaleString()} participating
          </span>
        </div>
      )}
    </Link>
  )
}
