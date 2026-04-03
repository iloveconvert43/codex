'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Check, X } from 'lucide-react'
import Link from 'next/link'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import Avatar from '@/components/ui/Avatar'
import BottomNav from '@/components/layout/BottomNav'
import { getRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function MessageRequestsPage() {
  const { data, mutate, isLoading } = useSWR('/api/messages/requests', swrFetcher)
  const requests: any[] = (data as any)?.data || []

  async function handleAction(requestId: string, action: 'accept' | 'decline') {
    try {
      await api.patch('/api/messages/requests', { request_id: requestId, action }, { requireAuth: true })
      toast.success(action === 'accept' ? 'Request accepted! You can now chat.' : 'Request declined')
      mutate()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/messages" className="text-text-muted hover:text-text">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="font-bold">Message Requests</h1>
          {requests.length > 0 && (
            <span className="ml-auto bg-primary text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {requests.length}
            </span>
          )}
        </div>
      </div>

      <main className="max-w-2xl mx-auto pb-nav">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-bg-card2 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-bg-card2 rounded w-32" />
                  <div className="h-10 bg-bg-card2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <span className="text-5xl mb-4">💬</span>
            <h3 className="font-semibold mb-1">No message requests</h3>
            <p className="text-sm text-text-muted">People who want to message you will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {requests.map((req: any) => (
              <div key={req.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/profile/${req.sender?.id}`} className="flex-shrink-0">
                    <Avatar user={req.sender} size={48} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/profile/${req.sender?.id}`}
                        className="font-semibold text-sm hover:underline">
                        {req.sender?.display_name || req.sender?.username}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {getRelativeTime(req.created_at)}
                      </span>
                    </div>
                    {/* The message they sent */}
                    <div className="bg-bg-card2 border border-border rounded-2xl rounded-tl-sm px-3 py-2 mb-3">
                      <p className="text-sm text-text">{req.message}</p>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(req.id, 'accept')}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-[0.98] transition-transform">
                        <Check size={16} /> Accept
                      </button>
                      <button
                        onClick={() => handleAction(req.id, 'decline')}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-sm font-semibold text-text-muted hover:bg-bg-card2 active:scale-[0.98] transition-all">
                        <X size={16} /> Decline
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
