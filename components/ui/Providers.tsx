'use client'

import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'

function RealtimeInit() {
  useRealtimeMessages()
  return null
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
      // Show cached data immediately while revalidating
      keepPreviousData: true,
      // Revalidate in background without blocking UI
      revalidateIfStale: true,
      suspense: false }}>
      <><RealtimeInit />{children}</>
    </SWRConfig>
  )
}
