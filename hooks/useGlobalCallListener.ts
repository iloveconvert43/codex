'use client'

/**
 * hooks/useGlobalCallListener.ts
 *
 * Listens for incoming calls from ANY page — not just messages page.
 * Two mechanisms:
 *   1. BroadcastChannel — receives messages from service worker push events
 *   2. Supabase Realtime — receives WebRTC call-offer when app is open
 *
 * Usage: mount once in root layout
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

interface IncomingCall {
  callerId:    string
  callerName:  string
  callerAvatar: string | null
  callType:    'audio' | 'video'
}

export function useGlobalCallListener() {
  const { profile } = useAuth()
  const router = useRouter()
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const channelRef = useRef<any>(null)
  const callOfferRef = useRef<any>(null)  // store offer for when user accepts

  const dismissCall = useCallback(() => {
    setIncomingCall(null)
    callOfferRef.current = null
  }, [])

  const acceptCall = useCallback(() => {
    if (!incomingCall) return
    // Navigate to messages page — ChatArea will handle WebRTC answer
    router.push(`/messages?user=${incomingCall.callerId}&action=answer&type=${incomingCall.callType}`)
    setIncomingCall(null)
  }, [incomingCall, router])

  const declineCall = useCallback(() => {
    if (!incomingCall) return
    // Signal decline via API (service worker or direct)
    fetch('/api/calls/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller_id: incomingCall.callerId })
    }).catch(() => {})
    dismissCall()
  }, [incomingCall, dismissCall])

  useEffect(() => {
    if (!profile?.id) return

    // 1. BroadcastChannel — receives signals from service worker
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('call-signals')
      bc.onmessage = (e) => {
        if (e.data?.type === 'incoming_call') {
          setIncomingCall({
            callerId:    e.data.callerId,
            callerName:  e.data.callerName  || 'Someone',
            callerAvatar: e.data.callerAvatar || null,
            callType:    e.data.callType    || 'audio',
          })
        }
        if (e.data?.type === 'decline') {
          // Other tab declined — dismiss here too
          dismissCall()
        }
      }
    } catch {}

    // 2. Supabase Realtime — listen to ALL potential caller channels
    // Subscribe to a personal channel that callers can broadcast to
    const myChannel = supabase.channel(`user-calls:${profile.id}`, {
      config: {
        broadcast: { ack: true },   // acknowledge broadcasts for reliability
      }
    })
      .on('broadcast', { event: 'call-offer' }, async ({ payload }: any) => {
        if (payload.from === profile.id) return
        // Store offer for when user accepts and navigates to messages page
        callOfferRef.current = payload

        // Fetch caller info
        const { data: caller } = await supabase
          .from('users')
          .select('id, display_name, username, avatar_url')
          .eq('id', payload.from).single()

        setIncomingCall({
          callerId:     payload.from,
          callerName:   caller?.display_name || caller?.username || 'Someone',
          callerAvatar: caller?.avatar_url   || null,
          callType:     payload.callType     || 'audio',
        })
      })
      .on('broadcast', { event: 'call-end' }, ({ payload }: any) => {
        if (payload.from !== profile.id) dismissCall()
      })
      .subscribe()

    channelRef.current = myChannel

    return () => {
      bc?.close()
      supabase.removeChannel(myChannel)
      channelRef.current = null
    }
  }, [profile?.id, dismissCall])

  return { incomingCall, acceptCall, declineCall, dismissCall }
}
