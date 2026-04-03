'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import MessagesContent from './MessagesContent'

export default function MessagesPage() {
  const { isLoggedIn, isLoading } = useAuth()
  const router = useRouter()
  const [maxWaitDone, setMaxWaitDone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMaxWaitDone(true), 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace('/login?redirect=/messages')
    }
  }, [isLoggedIn, isLoading, router])

  if ((isLoading || !isLoggedIn) && !maxWaitDone) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!isLoggedIn) return null

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MessagesContent />
    </Suspense>
  )
}
