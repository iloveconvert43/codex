'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, Users, Plus, Check } from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import { useAuth } from '@/hooks/useAuth'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { TopicRoom } from '@/types'

export default function RoomsPage() {
  const { isLoggedIn } = useAuth()
  const { data, mutate } = useSWR<{ data: TopicRoom[] }>('/api/rooms', fetcher)
  const rooms: TopicRoom[] = data?.data ?? []
  const [joining, setJoining] = useState<string | null>(null)

  async function toggleJoin(room: TopicRoom) {
    if (!isLoggedIn) { toast.error('Sign in to join rooms'); return }
    setJoining(room.slug)
    try {
      const res = await api.post(`/api/rooms/${room.slug}/join`, {}, { requireAuth: true }) as any
      mutate(prev => prev ? {
        ...prev,
        data: prev.data.map(r => r.slug === room.slug
          ? { ...r, is_member: res.joined, member_count: r.member_count + (res.joined ? 1 : -1) }
          : r)
      } : prev, false)
      toast.success(res.joined ? `Joined ${room.name}!` : `Left ${room.name}`)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setJoining(null) }
  }

  const featured = rooms.filter(r => r.is_featured)
  const other = rooms.filter(r => !r.is_featured)

  const Inner = (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <p className="text-sm text-text-secondary mb-5">
        Join topic rooms to see focused posts and connect with people who share your interests.
      </p>

      {featured.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">🔥 Featured Rooms</h2>
          <div className="space-y-2 mb-6">
            {featured.map(room => <RoomCard key={room.id} room={room} onJoin={toggleJoin} joining={joining} />)}
          </div>
        </>
      )}

      {other.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">All Rooms</h2>
          <div className="space-y-2">
            {other.map(room => <RoomCard key={room.id} room={room} onJoin={toggleJoin} joining={joining} />)}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <h1 className="font-bold">Topic Rooms</h1>
          </div>
        </div>
        <main className="pb-nav">{Inner}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3">
            <h1 className="font-bold">Topic Rooms</h1>
          </div>
          {Inner}
        </main>
      </div>
    </div>
  )
}

function RoomCard({ room, onJoin, joining }: { room: TopicRoom; onJoin: (r: TopicRoom) => void; joining: string | null }) {
  return (
    <div className="glass-card px-4 py-3 flex items-center gap-3 hover:border-border-active transition-all">
      <span className="text-2xl flex-shrink-0">{room.emoji}</span>
      <div className="flex-1 min-w-0">
        <Link href={`/?filter=room&room=${room.slug}`} className="font-semibold text-sm hover:text-primary transition-colors block truncate">
          {room.name}
        </Link>
        {room.description && <p className="text-xs text-text-muted truncate">{room.description}</p>}
        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
          <Users size={10} /> {room.member_count.toLocaleString()} members
          · {room.post_count.toLocaleString()} posts
        </p>
      </div>
      <button
        onClick={() => onJoin(room)}
        disabled={joining === room.slug}
        className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex-shrink-0',
          room.is_member
            ? 'bg-primary-muted border-primary text-primary'
            : 'bg-transparent border-border text-text-secondary hover:border-primary hover:text-primary'
        )}
      >
        {room.is_member ? <><Check size={11} /> Joined</> : <><Plus size={11} /> Join</>}
      </button>
    </div>
  )
}
