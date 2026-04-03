/**
 * hooks/useNotifications.ts
 * Wrapper around Zustand notificationStore.
 * Backwards compatible with existing components.
 */
'use client'

import { useEffect } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'
import { useAuth } from './useAuth'

export function useNotifications() {
  const { notifications, unreadCount, markAllRead, fetchNotifications, subscribe, initialized } = useNotificationStore()
  const { profile } = useAuth()

  // Fetch on mount if not already loaded
  useEffect(() => {
    if (!initialized && profile?.id) {
      fetchNotifications()
    }
  }, [initialized, profile?.id, fetchNotifications])

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!profile?.id) return
    const cleanup = subscribe(profile.id)
    return cleanup
  }, [profile?.id, subscribe])

  // Include follow request count in the total unread badge
  const { data: frData } = useSWR(
    profile?.id ? '/api/users/follow-requests' : null,
    swrFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true }
  )
  const followRequestCount: number = (frData as any)?.data?.length ?? 0

  // Total badge count = unread notifications + pending follow requests
  const totalUnread = unreadCount + followRequestCount

  return {
    notifications,
    unreadCount: totalUnread,
    notificationUnreadCount: unreadCount,
    markAllRead,
    isLoading: !initialized,
    followRequestCount }
}
