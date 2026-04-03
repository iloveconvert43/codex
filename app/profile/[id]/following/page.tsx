'use client'

export const dynamic = 'force-dynamic'

import { useParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import toast from 'react-hot-toast'
import { useState } from 'react'

export default function FollowingPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: me, isLoggedIn } = useAuth()
  const { data, isLoading } = useSWR(`/api/users/${id}/following`, fetcher)
  const { data: userData } = useSWR(`/api/users/${id}`, fetcher)
  const following: any[] = (data as any)?.data ?? []
  const count: number = (data as any)?.count ?? 0
  const user = (userData as any)?.data
  const [unfollowed, setUnfollowed] = useState<Set<string>>(new Set())

  async function toggleFollow(userId: string) {
    if (!isLoggedIn) { toast.error('Sign in to follow'); return }
    try {
      const res = await api.post(`/api/users/${userId}/follow`, {}, { requireAuth: true }) as any
      if (!res.is_following) setUnfollowed(prev => new Set([...prev, userId]))
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  const Inner = (
    <div className="max-w-lg mx-auto">
      <p className="text-sm text-text-muted px-4 py-3 border-b border-border">
        Following {count.toLocaleString()} people
      </p>
      {isLoading ? (
        <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-bg-card2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-bg-card2 rounded w-24" />
            </div>
          </div>
        ))}</div>
      ) : following.length === 0 ? (
        <div className="py-16 text-center text-text-secondary text-sm">Not following anyone yet</div>
      ) : (
        <div className="divide-y divide-border">
          {following.filter(u => !unfollowed.has(u.id)).map((user: any) => (
            <div key={user.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/profile/${user.id}`}><Avatar user={user} size={42} /></Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${user.id}`} className="font-semibold text-sm hover:text-primary">
                  {user.display_name || user.username}
                </Link>
                {user.username && <p className="text-xs text-text-muted">@{user.username}</p>}
                {user.city && <p className="text-xs text-text-muted">{user.city}</p>}
              </div>
              {me?.id !== user.id && isLoggedIn && (
                <button onClick={() => toggleFollow(user.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-primary text-primary hover:bg-accent-red/10 hover:border-accent-red hover:text-accent-red transition-all">
                  Following
                </button>
              )}
            </div>
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
            <Link href={`/profile/${id}`} className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <h1 className="font-bold">Following</h1>
          </div>
        </div>
        <main className="pb-nav">{Inner}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center gap-3">
            <Link href={`/profile/${id}`} className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
            <h2 className="font-bold">Following</h2>
          </div>
          {Inner}
        </main>
      </div>
    </div>
  )
}
