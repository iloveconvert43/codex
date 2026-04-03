'use client'

export const dynamic = 'force-dynamic'
import { ArrowLeft, UserX } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import { api, swrFetcher } from '@/lib/api'
import Avatar from '@/components/ui/Avatar'
import toast from 'react-hot-toast'

export default function BlockedUsersPage() {
  const { data, mutate } = useSWR('/api/users/blocked', swrFetcher)
  const blocked: any[] = (data as any)?.data ?? []

  async function unblock(userId: string) {
    try {
      await api.post(`/api/users/${userId}/block`, {}, { requireAuth: true })
      mutate()
      toast.success('Unblocked')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/settings" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
          <h1 className="font-bold flex items-center gap-2"><UserX size={18} /> Blocked Users</h1>
        </div>
      </div>
      <div className="max-w-xl mx-auto">
        {blocked.length === 0 ? (
          <div className="py-20 text-center">
            <UserX size={40} className="text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">No blocked users</p>
          </div>
        ) : (
          blocked.map(user => (
            <div key={user.id} className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Avatar user={user} size={44} />
              <div className="flex-1">
                <p className="font-semibold text-sm">{user.display_name || user.username}</p>
                <p className="text-xs text-text-muted">@{user.username}</p>
              </div>
              <button onClick={() => unblock(user.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary transition-all">
                Unblock
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
