'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Bell, ArrowLeft, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { api, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import { useNotifications } from '@/hooks/useNotifications'
import Avatar from '@/components/ui/Avatar'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import { NotificationSkeleton } from '@/components/ui/Skeleton'
import { getRelativeTime, cn } from '@/lib/utils'

const NOTIF_ICONS: Record<string, string> = {
  new_reaction:           '🤩',
  new_comment:            '💬',
  new_follower:           '👤',
  follow_request:         '🔐',
  follow_accepted:        '✅',
  tagged_in_post:         '🏷️',
  mystery_revealed:       '✨',
  challenge_reminder:     '🔥',
  streak_milestone:       '⚡',
  badge_awarded:          '🏆',
  new_message:            '💌',
  new_anonymous_question: '🤫',
  level_up:               '🎉',
  reshare_received:       '🔄' }

const NOTIF_HREF = (n: any): string => {
  if (n.type === 'new_message') return `/messages?user=${n.actor_id}`
  if (n.type === 'new_anonymous_question') return '/questions'
  if (n.type === 'new_follower') return `/profile/${n.actor_id}`
  if (n.type === 'follow_request') return '/notifications'
  if (n.type === 'follow_accepted') return `/profile/${n.actor_id}`
  if (n.post_id) return `/post/${n.post_id}`
  return '#'
}

function FollowRequestsSection() {
  const { data, mutate } = useSWR('/api/users/follow-requests', fetcher)
  const requests: any[] = (data as any)?.data ?? []
  const [processing, setProcessing] = useState<string | null>(null)

  if (!requests.length) return null

  async function handleRequest(requestId: string, action: 'accept' | 'reject') {
    setProcessing(requestId)
    try {
      await api.post('/api/users/follow-requests', { request_id: requestId, action }, { requireAuth: true })
      mutate()
      toast.success(action === 'accept' ? 'Follow request accepted! ✅' : 'Request declined')
    } catch (e) {
      toast.error('Failed to process request')
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="border-b border-border">
      <div className="px-4 py-2.5 bg-primary/5 flex items-center gap-2">
        <span className="text-xs font-bold text-primary uppercase tracking-wider">
          Follow Requests
        </span>
        <span className="ml-auto text-xs font-bold bg-primary text-white px-2 py-0.5 rounded-full">
          {requests.length}
        </span>
      </div>
      {requests.map((req: any) => (
        <div key={req.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-sm text-white flex-shrink-0">
            {req.requester?.display_name?.[0] || req.requester?.username?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{req.requester?.display_name || req.requester?.username}</p>
            <p className="text-xs text-text-muted">{req.requester?.bio?.slice(0, 50) || 'wants to follow you'}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => handleRequest(req.id, 'accept')}
              disabled={processing === req.id}
              className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg"
            >
              {processing === req.id ? '…' : 'Accept'}
            </button>
            <button
              onClick={() => handleRequest(req.id, 'reject')}
              disabled={processing === req.id}
              className="px-3 py-1.5 bg-bg-card2 text-text-secondary text-xs font-semibold rounded-lg border border-border"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}


/**
 * Groups similar notifications:
 * "Rahul reacted" + "Priya reacted" → "Rahul and 1 other reacted"
 */
function groupNotifications(notifs: any[]): any[] {
  const grouped: any[] = []
  const seen = new Map<string, { item: any; count: number; actors: any[] }>()

  for (const n of notifs) {
    if (!n.post_id || !['new_reaction', 'new_comment'].includes(n.type)) {
      grouped.push(n)
      continue
    }
    const key = `${n.type}:${n.post_id}`
    if (seen.has(key)) {
      const g = seen.get(key)!
      g.count++
      if (g.actors.length < 3) g.actors.push(n.actor)
    } else {
      const entry = { item: { ...n }, count: 1, actors: [n.actor] }
      seen.set(key, entry)
      grouped.push(entry.item)
    }
  }

  // Update grouped items with combined actor names
  for (const [key, g] of seen) {
    if (g.count > 1) {
      const item = grouped.find(i => `${i.type}:${i.post_id}` === key)
      if (item) {
        const firstName = g.actors[0]?.display_name || g.actors[0]?.username || 'Someone'
        const extra = g.count - 1
        item._grouped_text = `${firstName} and ${extra} other${extra > 1 ? 's' : ''}`
        item._group_count = g.count
      }
    }
  }

  return grouped
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markAllRead, isLoading } = useNotifications()

  async function clearAll() {
    if (!confirm('Clear all notifications? This cannot be undone.')) return
    try {
      await fetch('/api/notifications', { method: 'DELETE' })
      window.location.reload()
    } catch { toast.error('Failed to clear') }
  }

  // FIX: stabilize deps — markAllRead called only once
  useEffect(() => {
    const timer = setTimeout(markAllRead, 1500) // small delay so user sees unread state
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Inner = (
    <div>
      {/* Clear all + Mark all read */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-end gap-3 px-4 py-2 border-b border-border">
          <button onClick={clearAll}
            className="text-xs text-text-muted hover:text-text transition-colors">
            Clear all
          </button>
          <button
            onClick={markAllRead}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <CheckCheck size={12} /> Mark all read
          </button>
        </div>
      )}

      {isLoading ? (
        <>
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
        </>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <Bell size={40} className="text-text-muted mb-4 opacity-30" />
          <h3 className="font-semibold mb-1">All caught up!</h3>
          <p className="text-sm text-text-muted">No notifications yet. Start posting!</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={NOTIF_HREF(n)}
              className={cn(
                'flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors',
                !n.is_read && 'bg-primary/[0.04]'
              )}
            >
              {/* Actor avatar or icon */}
              <div className="relative flex-shrink-0">
                {n.actor ? (
                  <Avatar user={n.actor} size={40} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg-card2 border border-border flex items-center justify-center text-lg">
                    {NOTIF_ICONS[n.type] ?? '🔔'}
                  </div>
                )}
                {/* Type badge overlay */}
                {n.actor && NOTIF_ICONS[n.type] && (
                  <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">
                    {NOTIF_ICONS[n.type]}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-text leading-snug">
                  {n.actor && (
                    <span className="font-semibold">
                      {n.actor.display_name || n.actor.username}{' '}
                    </span>
                  )}
                  <span className="text-text-secondary">{n.message}</span>
                </p>
                <p className="text-xs text-text-muted mt-0.5">{getRelativeTime(n.created_at)}</p>
              </div>

              {!n.is_read && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
              )}
            </Link>
          ))}
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
            <h1 className="font-bold flex items-center gap-2">
              <Bell size={18} /> Notifications
              {unreadCount > 0 && (
                <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>
        </div>
        <main className="pb-nav">{Inner}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
            <h1 className="font-bold flex items-center gap-2">
              <Bell size={18} /> Notifications
              {unreadCount > 0 && (
                <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </h1>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-w-2xl mx-auto">{Inner}</div>
        </main>
      </div>
    </div>
  )
}
