/**
 * store/notificationStore.ts
 * Centralized notification state with real-time Supabase subscription.
 */
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import type { Notification } from '@/types'

interface NotificationStore {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  initialized: boolean
  _cleanup: (() => void) | null

  // Actions
  setNotifications: (notifs: Notification[]) => void
  prependNotification: (notif: Notification) => void
  markAllRead: () => Promise<void>
  fetchNotifications: () => Promise<void>
  subscribe: (userId: string) => () => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  initialized: false,
  _cleanup: null,

  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.is_read).length,
    initialized: true }),

  prependNotification: (notif) => set(s => {
    const notifications = [notif, ...s.notifications]
    return { notifications, unreadCount: s.unreadCount + (notif.is_read ? 0 : 1) }
  }),

  fetchNotifications: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const json = await api.get('/api/notifications')
      get().setNotifications(json.data ?? [])
    } catch {
      // Silently fail — user might not be logged in
    } finally {
      set({ loading: false })
    }
  },

  markAllRead: async () => {
    const { notifications, unreadCount } = get()
    if (unreadCount === 0) return

    // Optimistic update — immediately clear badges
    set({
      notifications: notifications.map(n => ({ ...n, is_read: true })),
      unreadCount: 0,
      _markingRead: true,  // Prevent realtime refetch from overriding optimistic state
    } as any)

    try {
      await api.patch('/api/notifications')
      // Keep the guard flag for 5s to let DB propagate + realtime settle
      setTimeout(() => set({ _markingRead: false } as any), 5000)
    } catch {
      setTimeout(() => set({ _markingRead: false } as any), 500)
      // Revert on error
      get().fetchNotifications()
    }
  },

  subscribe: (userId: string) => {
    // Cleanup any existing subscription
    get()._cleanup?.()

    const channel = supabase
      .channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const notif = payload.new as Notification
        // Double-check user_id matches (defense in depth)
        if ((notif as any).user_id !== userId) return
        get().prependNotification(notif)
      })
      // Also listen for notification reads (mark all read)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        // Skip refetch if we're in the middle of an optimistic markAllRead
        if ((get() as any)._markingRead) return
        // Refresh count when notifications are marked read
        get().fetchNotifications()
      })
      .subscribe()

    const cleanup = () => supabase.removeChannel(channel)
    set({ _cleanup: cleanup })
    return cleanup
  } }))
