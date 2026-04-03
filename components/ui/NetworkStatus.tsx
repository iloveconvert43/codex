'use client'

import { useState, useEffect, useCallback } from 'react'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NetworkStatus() {
  const [online, setOnline] = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)

    const handleOnline = () => {
      setOnline(true)
      if (wasOffline) {
        // Show "back online" briefly then hide
        setShowBanner(true)
        setTimeout(() => setShowBanner(false), 3000)
      }
      setWasOffline(false)
    }

    const handleOffline = () => {
      setOnline(false)
      setWasOffline(true)
      setShowBanner(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  const handleRetry = useCallback(async () => {
    setRetrying(true)
    try {
      // Ping Supabase to check actual connectivity
      const r = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', {
        method: 'HEAD',
        cache: 'no-store' })
      if (r.ok) {
        setOnline(true)
        setShowBanner(false)
      }
    } catch {
      // Still offline
    } finally {
      setRetrying(false)
    }
  }, [])

  if (!showBanner) return null

  return (
    <div className={cn(
      'fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold transition-all duration-300 safe-top',
      online
        ? 'bg-accent-green/90 text-white'
        : 'bg-zinc-900/95 text-white border-b border-zinc-700'
    )}>
      {online ? (
        <>
          <Wifi size={15} />
          Back online!
        </>
      ) : (
        <>
          <WifiOff size={15} />
          No internet connection
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="ml-2 flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full text-xs transition-colors"
          >
            <RefreshCw size={11} className={retrying ? 'animate-spin' : ''} />
            {retrying ? 'Checking…' : 'Retry'}
          </button>
        </>
      )}
    </div>
  )
}
