'use client'

/**
 * useRealtimeMessages
 * 
 * Global listener for new direct messages to the current user.
 * Updates conversation list unread counts in real time.
 * Mounted once in layout — does NOT require a specific conversation to be open.
 */

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { mutate } from 'swr'

export function useRealtimeMessages() {
  const { profile } = useAuth()

  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`inbox:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`,
      }, () => {
        // Refresh conversation list so unread badges update
        mutate('/api/messages/conversations')
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])
}
