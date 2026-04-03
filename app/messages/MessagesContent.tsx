'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowLeft, Send, Loader2, MessageCircle, Check, CheckCheck,
  Phone, Video, MoreVertical, Smile, Trash2, Image as ImageIcon
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import { uploadToImageKit, getImageKitUrl } from '@/lib/upload'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import { getRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { sendMessageSchema, validate } from '@/lib/validation/schemas'
import { analytics } from '@/lib/analytics'
import { cn } from '@/lib/utils'


function formatChatTime(value: string | number | Date | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

// ── WebRTC Call Hook ──────────────────────────────────────────
function useCall(myId: string | null, otherUserId: string | null) {
  const [callState, setCallState] = useState<
    'idle' | 'calling' | 'incoming' | 'connected' | 'ended'
  >('idle')
  const [callType, setCallType] = useState<'audio' | 'video'>('audio')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)

  const pcRef       = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const channelRef  = useRef<any>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const localVideoRef  = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)

  const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

  // Subscribe to call signaling channel
  useEffect(() => {
    if (!myId || !otherUserId) return
    const channelId = [myId, otherUserId].sort().join('-')

    const ch = supabase.channel(`call:${channelId}`)
      .on('broadcast', { event: 'call-offer' }, async ({ payload }: any) => {
        if (payload.from === myId) return  // own signal
        setCallType(payload.callType || 'audio')
        setIncomingCallerId(payload.from)
        setCallState('incoming')
        // Store offer for answer
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer))
        }
      })
      .on('broadcast', { event: 'call-answer' }, async ({ payload }: any) => {
        if (payload.from === myId) return
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer))
        }
        setCallState('connected')
        startCallTimer()
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
        if (payload.from === myId) return
        if (pcRef.current && payload.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate))
        }
      })
      .on('broadcast', { event: 'call-end' }, ({ payload }: any) => {
        if (payload.from === myId) return
        endCall(false)
      })
      .on('broadcast', { event: 'call-decline' }, ({ payload }: any) => {
        if (payload.from === myId) return
        endCall(false)
        toast('Call declined')
      })
      .subscribe()

    channelRef.current = ch
    return () => { supabase.removeChannel(ch); channelRef.current = null }
  }, [myId, otherUserId])

  function startCallTimer() {
    setCallDuration(0)
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }

  function stopCallTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  async function createPeerConnection(type: 'audio' | 'video') {
    const pc = new RTCPeerConnection(STUN)
    pcRef.current = pc

    // Get local media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { facingMode: 'user' } : false
    })
    localStream.current = stream
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    if (localVideoRef.current && type === 'video') {
      localVideoRef.current.srcObject = stream
    }

    // Remote stream
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
    }

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast', event: 'ice-candidate',
          payload: { from: myId, candidate: e.candidate }
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(false)
      }
    }

    return pc
  }

  async function startCall(type: 'audio' | 'video') {
    if (!myId || !otherUserId || !channelRef.current) {
      toast.error('Cannot start call right now')
      return
    }
    setCallType(type)
    setCallState('calling')

    try {
      const pc = await createPeerConnection(type)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Signal via WebRTC channel (for users with app open)
      channelRef.current.send({
        type: 'broadcast', event: 'call-offer',
        payload: { from: myId, offer, callType: type }
      })

      // Also send push notification (for users with app closed/background)
      fetch('/api/calls/ring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: otherUserId, call_type: type })
      }).catch(() => {})

    } catch (err: any) {
      toast.error('Could not access microphone' + (type === 'video' ? '/camera' : ''))
      setCallState('idle')
    }
  }

  async function answerCall() {
    if (!pcRef.current || !channelRef.current) return
    setCallState('connected')

    try {
      // Re-create PC with local media if not done yet
      if (!localStream.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true, video: callType === 'video'
        })
        localStream.current = stream
        stream.getTracks().forEach(t => pcRef.current!.addTrack(t, stream))
        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = stream
        }
      }

      const answer = await pcRef.current.createAnswer()
      await pcRef.current.setLocalDescription(answer)

      channelRef.current.send({
        type: 'broadcast', event: 'call-answer',
        payload: { from: myId, answer }
      })
      startCallTimer()
    } catch {
      toast.error('Could not access microphone')
      endCall(true)
    }
  }

  function declineCall() {
    channelRef.current?.send({
      type: 'broadcast', event: 'call-decline',
      payload: { from: myId }
    })
    cleanup()
    setCallState('idle')
    setIncomingCallerId(null)
  }

  function endCall(sendSignal = true) {
    if (sendSignal && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast', event: 'call-end',
        payload: { from: myId }
      })
    }
    stopCallTimer()
    cleanup()
    setCallState('idle')
    setIncomingCallerId(null)
  }

  function cleanup() {
    localStream.current?.getTracks().forEach(t => t.stop())
    localStream.current = null
    pcRef.current?.close()
    pcRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
  }

  function toggleMute() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  function toggleVideo() {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsVideoOff(v => !v)
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function setIncomingCall(type: 'audio' | 'video') {
    setCallType(type)
    setCallState('incoming')
  }

  return {
    callState, callType, isMuted, isVideoOff,
    incomingCallerId, callDuration: formatDuration(callDuration),
    localVideoRef, remoteVideoRef,
    startCall, answerCall, declineCall, endCall,
    toggleMute, toggleVideo, setIncomingCall,
  }
}

// ── Call UI ───────────────────────────────────────────────────
function CallOverlay({ call, otherUser }: { call: ReturnType<typeof useCall>; otherUser: any }) {
  const { callState, callType, isMuted, isVideoOff, callDuration,
    localVideoRef, remoteVideoRef, answerCall, declineCall, endCall, toggleMute, toggleVideo } = call

  if (callState === 'idle') return null

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-between py-12">
      {/* Remote video (fullscreen) */}
      {callType === 'video' && (
        <video ref={remoteVideoRef} autoPlay playsInline
          className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Caller info */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20">
          {otherUser?.avatar_url
            ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full bg-primary flex items-center justify-center text-white text-3xl font-bold">
                {(otherUser?.display_name || '?')[0]}
              </div>}
        </div>
        <div>
          <p className="text-white text-xl font-bold">
            {otherUser?.display_name || otherUser?.username}
          </p>
          <p className="text-white/60 text-sm mt-1">
            {callState === 'calling'   ? 'Calling…' :
             callState === 'incoming'  ? `Incoming ${callType} call` :
             callState === 'connected' ? callDuration : ''}
          </p>
        </div>
      </div>

      {/* Local video (pip) */}
      {callType === 'video' && callState === 'connected' && (
        <video ref={localVideoRef} autoPlay playsInline muted
          className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-white/20 z-20" />
      )}

      {/* Call controls */}
      <div className="relative z-10 flex items-center gap-6">
        {callState === 'incoming' ? (
          <>
            {/* Decline */}
            <button onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl active:scale-95">
              <Phone size={24} className="rotate-[135deg]" />
            </button>
            {/* Answer */}
            <button onClick={answerCall}
              className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-xl active:scale-95">
              <Phone size={24} />
            </button>
          </>
        ) : (
          <>
            {/* Mute */}
            <button onClick={toggleMute}
              className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white",
                isMuted ? "bg-white/30" : "bg-white/10")}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            {/* Video toggle */}
            {callType === 'video' && (
              <button onClick={toggleVideo}
                className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white",
                  isVideoOff ? "bg-white/30" : "bg-white/10")}>
                {isVideoOff ? '📵' : '📹'}
              </button>
            )}
            {/* End call */}
            <button onClick={() => endCall(true)}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl active:scale-95">
              <Phone size={24} className="rotate-[135deg]" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function MessagesContent() {
  const { isLoggedIn, loading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const withUser = params.get('user')

  useEffect(() => {
    if (!loading && !isLoggedIn) router.push('/login?redirect=/messages')
  }, [loading, isLoggedIn, router])

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!isLoggedIn) return null

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden flex flex-col h-screen">
        {withUser ? (
          <ChatArea userId={withUser} />
        ) : (
          <>
            <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <Link href="/" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
                <h1 className="font-bold flex items-center gap-2"><MessageCircle size={18} /> Messages</h1>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pb-nav">
              <ConversationList activeUserId={null} />
            </div>
            <BottomNav />
          </>
        )}
      </div>

      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <div className="flex-1 flex overflow-hidden border-x border-border">
          <div className="w-72 border-r border-border flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
              <h2 className="font-bold">Messages</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList activeUserId={withUser} />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {withUser ? <ChatArea userId={withUser} /> : (
              <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center px-8">
                <MessageCircle size={40} className="text-text-muted opacity-30" />
                <p className="text-text-secondary text-sm">Select a conversation to start messaging</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Conversation List ─────────────────────────────────────────
const ConversationList = memo(function ConversationList({ activeUserId }: { activeUserId: string | null }) {
  const { data, isLoading, mutate } = useSWR('/api/messages/conversations', swrFetcher, {
    refreshInterval: 4000, revalidateOnFocus: true, keepPreviousData: true })
  const conversations: any[] = (data as any)?.data || []

  useEffect(() => {
    const refresh = () => { mutate() }
    window.addEventListener('messages:refresh', refresh)
    return () => window.removeEventListener('messages:refresh', refresh)
  }, [mutate])

  if (isLoading) return (
    <div className="p-4 space-y-3">
      {[1,2,3].map(i => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-bg-card2" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-bg-card2 rounded w-24" />
            <div className="h-2.5 bg-bg-card2 rounded w-40" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!conversations.length) return (
    <div className="p-8 text-center text-sm text-text-muted">
      <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
      No conversations yet
    </div>
  )

  return (
    <div className="divide-y divide-border">
      {conversations.map((conv: any) => (
        <Link key={conv.other_user?.id} href={`/messages?user=${conv.other_user?.id}`}
          className={cn("flex items-center gap-3 px-4 py-3 hover:bg-bg-card2 transition-colors",
            activeUserId === conv.other_user?.id ? 'bg-primary-muted' : '')}>
          <div className="relative flex-shrink-0">
            <Avatar user={conv.other_user} size={40} />
            {conv.unread_count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-bg">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold truncate">
                {conv.other_user?.display_name || conv.other_user?.username}
              </p>
              <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">
                {formatChatTime(conv.last_message?.created_at)}
              </span>
            </div>
            <p className={cn("text-xs truncate",
              conv.unread_count > 0 ? 'text-text font-medium' : 'text-text-muted')}>
              {conv.last_message?.content || (conv.last_message?.image_url ? '📷 Photo' : '')}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
})

// ── Chat Area ─────────────────────────────────────────────────
function ChatArea({ userId }: { userId: string }) {
  const { profile } = useAuth()
  const [message, setMessage]   = useState('')
  const [sending, setSending]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)
  const messagesRef   = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef    = useRef<any>(null)
  const [otherTyping, setOtherTyping] = useState(false)
  const [myTyping, setMyTyping]       = useState(false)

  const chatParams  = useSearchParams()
  const autoAnswer  = chatParams.get('action') === 'answer'
  const autoCallType = (chatParams.get('type') || 'audio') as 'audio' | 'video'

  const { data: userRes } = useSWR(`/api/users/${userId}`, swrFetcher)
  const { data: msgsRes, mutate } = useSWR(
    `/api/messages/thread/${userId}`, swrFetcher,
    { revalidateOnFocus: true, refreshInterval: 2500, keepPreviousData: true }
  )
  // Check DM permission — is this a free DM, pending request, or need request?
  const { data: permRes, mutate: mutatePermission } = useSWR(
    `/api/messages/permission?user_id=${userId}`, fetcher,
    { revalidateOnFocus: false }
  )

  const otherUser  = (userRes as any)?.data
  const messages: any[] = (msgsRes as any)?.data || []
  const dmPermission: string = (permRes as any)?.permission || 'free'

  const call = useCall(profile?.id ?? null, userId)

  // Auto-trigger incoming call UI when user navigated here from push notification
  useEffect(() => {
    if (autoAnswer && call.callState === 'idle' && profile?.id) {
      // Small delay so WebRTC channel is subscribed first
      const t = setTimeout(() => {
        call.setIncomingCall(autoCallType)
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [autoAnswer, profile?.id]) // eslint-disable-line

  // Track scroll position — only auto-scroll when near bottom
  function handleScroll() {
    const el = messagesRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsNearBottom(distFromBottom < 100)
  }

  // Scroll to bottom on new messages — only if near bottom
  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' } as any)
  }, [userId])

  // Realtime subscription — messages + typing
  useEffect(() => {
    if (!profile?.id) return
    const channelId = [profile.id, userId].sort().join('-')

    const channel = supabase.channel(`dm:${channelId}`)
      // Filter: only this conversation's messages (sender_id or receiver_id = current user)
      // Using broadcast for typing + postgres_changes for persistence
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`,  // only receive messages TO me in this thread
      }, (payload: any) => {
        // Only update if it's from the person we're talking to
        if (payload.new?.sender_id === userId) mutate()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`,
      }, () => mutate())
      // Typing via Broadcast (not Presence — Presence key is random, Broadcast is reliable)
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.user_id !== profile.id) {
          setOtherTyping(true)
          // Auto-clear after 3s (in case stop event missed)
          setTimeout(() => setOtherTyping(false), 3000)
        }
      })
      .on('broadcast', { event: 'stop-typing' }, ({ payload }: any) => {
        if (payload.user_id !== profile.id) setOtherTyping(false)
      })
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [profile?.id, userId, mutate])

  // Typing indicator
  const handleTyping = useCallback((val: string) => {
    setMessage(val)
    if (!profile?.id || !channelRef.current) return

    if (!myTyping) {
      setMyTyping(true)
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: profile.id } })
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setMyTyping(false)
      channelRef.current?.send({ type: 'broadcast', event: 'stop-typing', payload: { user_id: profile.id } })
    }, 2000)
  }, [profile?.id, myTyping])

  async function sendMessage() {
    const content = message.trim()
    if (!content || sending) return
    const v = validate(sendMessageSchema, { to_user_id: userId, content })
    if (!v.success) { toast.error(v.error); return }

    setMessage('')
    setSending(true)
    channelRef.current?.send({ type: 'broadcast', event: 'stop-typing', payload: { user_id: profile?.id } })

    try {
      await api.post('/api/messages/send', { to_user_id: userId, content }, { requireAuth: true })
      analytics.track('message_send')
      mutate()
      window.dispatchEvent(new Event('messages:refresh'))
    } catch (e: any) {
      const code = e?.response?.data?.code || e?.code
      if (code === 'REQUEST_REQUIRED') {
        toast.error('Follow or send a message request first', { duration: 4000 })
        mutatePermission()  // refresh permission state
      } else if (code === 'REQUEST_PENDING') {
        toast('Your message request is pending their approval ⏳', { duration: 4000 })
      } else {
        toast.error(getErrorMessage(e))
        setMessage(content)
      }
    } finally {
      setSending(false)
    }
  }

  async function sendImage(file: File) {
    if (!file || sending || uploading) return
    setUploading(true)
    try {
      const result = await uploadToImageKit(file, 'images')
      if (!result?.url) throw new Error('Upload failed')
      await api.post('/api/messages/send', {
        to_user_id: userId,
        content: '',
        image_url: result.url,
      }, { requireAuth: true, timeout: 30000 })
      analytics.track('message_send')
      mutate()
      window.dispatchEvent(new Event('messages:refresh'))
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      toast.error(getErrorMessage(e))
    } finally {
      setUploading(false)
    }
  }


  async function deleteMessage(msgId: string) {
    try {
      await fetch('/api/messages/send', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msgId })
      })
      mutate()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Call overlay */}
      <CallOverlay call={call} otherUser={otherUser} />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0 bg-bg">
        <Link href="/messages" className="text-text-muted hover:text-text transition-colors flex-shrink-0 lg:hidden">
          <ArrowLeft size={20} />
        </Link>
        {otherUser ? (
          <>
            <Avatar user={otherUser} size={36} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">
                {otherUser.display_name || otherUser.full_name || otherUser.username}
              </div>
              {otherTyping
                ? <div className="text-xs text-primary animate-pulse">typing…</div>
                : <div className="text-xs text-text-muted">@{otherUser.username}</div>
              }
            </div>
            {/* Call buttons — only visible when mutual follow */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  if (dmPermission !== 'free') {
                    toast.error('Follow each other to enable calls')
                    return
                  }
                  call.startCall('audio')
                }}
                disabled={call.callState !== 'idle'}
                className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40",
                  dmPermission === 'free'
                    ? "bg-bg-card2 text-text-muted hover:text-primary hover:bg-primary-muted"
                    : "bg-bg-card2 text-text-muted/40 cursor-not-allowed"
                )}
                title={dmPermission === 'free' ? "Audio call" : "Follow each other to call"}>
                <Phone size={16} />
              </button>
              <button
                onClick={() => {
                  if (dmPermission !== 'free') {
                    toast.error('Follow each other to enable calls')
                    return
                  }
                  call.startCall('video')
                }}
                disabled={call.callState !== 'idle'}
                className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40",
                  dmPermission === 'free'
                    ? "bg-bg-card2 text-text-muted hover:text-primary hover:bg-primary-muted"
                    : "bg-bg-card2 text-text-muted/40 cursor-not-allowed"
                )}
                title={dmPermission === 'free' ? "Video call" : "Follow each other to call"}>
                <Video size={16} />
              </button>
              <Link href={`/profile/${otherUser.id}`}
                className="w-8 h-8 rounded-full bg-bg-card2 flex items-center justify-center text-text-muted hover:text-text transition-colors"
                title="View profile">
                <MoreVertical size={16} />
              </Link>
            </div>
          </>
        ) : (
          <div className="h-4 w-24 bg-bg-card2 rounded animate-pulse" />
        )}
      </div>

      {/* Messages */}
      <div ref={messagesRef} onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 hide-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">Say hello! 👋</div>
        ) : messages.map((msg: any) => {
          const isMine = msg.sender_id === profile?.id
          if (msg.content === 'Message deleted') return (
            <div key={msg.id} className={cn("flex gap-2", isMine ? "flex-row-reverse" : "")}>
              <p className="text-xs text-text-muted italic px-3 py-1.5">Message deleted</p>
            </div>
          )
          return (
            <div key={msg.id}
              className={cn("flex gap-2 items-end group", isMine ? "flex-row-reverse" : "")}>
              {!isMine && <Avatar user={msg.sender} size={28} className="flex-shrink-0 mb-1" />}
              <div className={cn(
                "max-w-[72%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words",
                isMine ? "bg-primary text-white rounded-tr-sm" : "bg-bg-card2 text-text rounded-tl-sm border border-border"
              )}>
                {msg.image_url && (
                  <a href={msg.image_url} target="_blank" rel="noreferrer" className="block mb-2">
                    <img
                      src={getImageKitUrl(msg.image_url, { w: 800, q: 80 })}
                      alt="Message attachment"
                      className="max-h-72 rounded-xl object-cover"
                    />
                  </a>
                )}
                {msg.content ? <p>{msg.content}</p> : msg.image_url ? <p className={cn('text-xs', isMine ? 'text-white/70' : 'text-text-muted')}>📷 Photo</p> : null}
                <div className={cn("flex items-center justify-end gap-1 text-[10px] mt-0.5",
                  isMine ? "text-white/60" : "text-text-muted")}>
                  <span>{formatChatTime(msg.created_at)}</span>
                  {isMine && (msg.is_read
                    ? <CheckCheck size={11} className="text-accent-green" />
                    : <Check size={11} />)}
                </div>
              </div>
              {/* Delete button on hover */}
              {isMine && (
                <button onClick={() => deleteMessage(msg.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent-red p-1">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )
        })}

        {/* Typing indicator */}
        {otherTyping && (
          <div className="flex gap-2 items-end">
            <Avatar user={otherUser} size={28} className="flex-shrink-0 mb-1" />
            <div className="bg-bg-card2 border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* New message nudge when not at bottom */}
      {!isNearBottom && messages.length > 0 && (
        <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-20 right-4 bg-primary text-white text-xs px-3 py-1.5 rounded-full shadow-lg">
          ↓ New messages
        </button>
      )}

      {/* Input — varies by permission state */}
      {dmPermission === 'request_needed' ? (
        <MessageRequestBox
          otherUser={otherUser}
          userId={userId}
          onSent={() => mutatePermission()}
        />
      ) : dmPermission === 'request_pending' ? (
        <div className="px-4 py-4 border-t border-border bg-bg text-center">
          <p className="text-sm text-text-muted">⏳ Message request pending</p>
          <p className="text-xs text-text-muted mt-1">Waiting for {otherUser?.display_name || 'them'} to accept</p>
        </div>
      ) : dmPermission === 'request_declined' ? (
        <div className="px-4 py-4 border-t border-border bg-bg text-center">
          <p className="text-sm text-text-muted">🚫 Cannot send messages to this user</p>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-border flex items-center gap-2 flex-shrink-0 bg-bg">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) sendImage(file) }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            className="w-9 h-9 rounded-full bg-bg-card2 border border-border disabled:opacity-40 flex items-center justify-center text-text-muted hover:text-primary transition-all flex-shrink-0"
            title="Send photo"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={16} />}
          </button>
          <input
            value={message}
            onChange={e => handleTyping(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={uploading ? "Uploading photo..." : "Message…"}
            maxLength={1000}
            className="flex-1 bg-bg-card2 border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-text-muted"
          />
          <button onClick={sendMessage} disabled={!message.trim() || sending || uploading}
            className="w-9 h-9 rounded-full bg-primary disabled:opacity-40 flex items-center justify-center text-white active:scale-95 transition-all flex-shrink-0">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      )}
    </div>
  )
}
