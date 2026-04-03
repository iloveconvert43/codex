'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowLeft, Send, Loader2, MessageCircle, Check, CheckCheck,
  Phone, Video, MoreVertical, Smile, Trash2, Mic, Square,
  MoreHorizontal, Search, ImagePlus, ThumbsUp, X
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { api, apiFetch, getErrorMessage, swrFetcher } from '@/lib/api'
import { uploadToImageKit, getImageKitUrl } from '@/lib/upload'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import toast from 'react-hot-toast'
import { sendMessageSchema, validate } from '@/lib/validation/schemas'
import { analytics } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { getDirectMessagePreview, isDirectMessageDeletedForEveryone, normalizeDirectMessageAttachments } from '@/lib/direct-messages'

const EMOJI_GROUPS = [
  { title: 'Smileys', items: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥹','😊','🙂','😉','😍','😘','😎','🤩','🥳','😇'] },
  { title: 'Feelings', items: ['😔','😢','😭','😡','😤','🤯','😴','🤔','🙄','😬','🤭','😮','😲','😌','😇','🫠','🥺','😵'] },
  { title: 'Gestures', items: ['👍','👎','👏','🙏','🤝','💪','🙌','👌','✌️','🤞','🫶','👀','👋','🤟','💯','🔥','✨','🎉'] },
  { title: 'Love', items: ['❤️','🩷','🧡','💛','💚','🩵','💙','💜','🤍','🖤','💕','💞','💓','💗','💘','💝','💖','💌'] },
  { title: 'Fun', items: ['😋','😜','😝','🤪','😛','🤓','😏','😈','👻','🤖','🎭','🎊','🎶','⭐','🌈','☀️','🌙','⚡'] },
]

function formatAudioDuration(seconds?: number | null) {
  if (!seconds || Number.isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}


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

function formatDayLabel(value: string | number | Date | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfMessage = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfMessage) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

type PendingMedia = {
  id: string
  file: File
  previewUrl: string
  type: 'image' | 'video' | 'audio'
  durationSec?: number | null
}

function MessageAttachments({
  attachments,
  isMine,
}: {
  attachments: Array<{ type: 'image' | 'video' | 'audio'; url: string; thumbnail_url?: string | null; duration_sec?: number | null }>
  isMine: boolean
}) {
  if (!attachments.length) return null
  const cols = attachments.length === 1 ? 'grid-cols-1' : attachments.length === 2 ? 'grid-cols-2' : 'grid-cols-2'

  return (
    <div className={cn('grid gap-2 mb-2', cols)}>
      {attachments.map((item, index) => (
        item.type === 'video' ? (
          <div
            key={`${item.url}-${index}`}
            className={cn(
              'relative overflow-hidden rounded-[20px] border',
              attachments.length === 1 ? 'max-w-sm' : 'aspect-square',
              isMine ? 'border-white/20 bg-white/10' : 'border-border bg-bg-card'
            )}
          >
            <video
              src={item.url}
              poster={item.thumbnail_url || undefined}
              controls
              playsInline
              className={cn('w-full h-full object-cover', attachments.length === 1 ? 'max-h-80' : '')}
            />
          </div>
        ) : item.type === 'audio' ? (
          <div
            key={`${item.url}-${index}`}
            className={cn(
              'relative overflow-hidden rounded-[20px] border p-3',
              attachments.length === 1 ? 'max-w-sm' : 'col-span-2',
              isMine ? 'border-white/20 bg-white/10' : 'border-border bg-bg-card'
            )}
          >
            <div className="flex items-center gap-2 mb-2 text-xs font-medium opacity-80">
              <Mic size={13} />
              <span>Voice message</span>
              {item.duration_sec ? <span>{formatAudioDuration(item.duration_sec)}</span> : null}
            </div>
            <audio src={item.url} controls className="w-full max-w-sm" />
          </div>
        ) : (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'relative overflow-hidden rounded-[20px] border',
              attachments.length === 1 ? 'max-w-sm' : 'aspect-square',
              isMine ? 'border-white/20 bg-white/10' : 'border-border bg-bg-card'
            )}
          >
            <img
              src={getImageKitUrl(item.url, { w: attachments.length === 1 ? 900 : 520, q: 80 })}
              alt="Message attachment"
              className={cn('w-full h-full object-cover', attachments.length === 1 ? 'max-h-80' : '')}
              loading="lazy"
            />
          </a>
        )
      ))}
    </div>
  )
}

function MessageActionsSheet({
  message,
  currentUserId,
  onClose,
  onDelete,
}: {
  message: any | null
  currentUserId: string | null | undefined
  onClose: () => void
  onDelete: (scope: 'me' | 'everyone') => Promise<void>
}) {
  if (!message) return null
  const isMine = message.sender_id === currentUserId
  const preview = getDirectMessagePreview(message, currentUserId)

  return (
    <div className="fixed inset-0 z-[210] bg-black/45 backdrop-blur-sm flex items-end justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md glass-card rounded-[28px] p-4 space-y-4 animate-slide-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="w-12 h-1.5 rounded-full bg-border mx-auto" />
        <div className="text-center">
          <p className="text-sm font-semibold">{isMine ? 'Your message' : 'Message options'}</p>
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {preview || 'Attachment'}
          </p>
        </div>
        <div className="space-y-2">
          {isMine && (
            <button
              onClick={() => onDelete('everyone')}
              className="w-full flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left hover:bg-bg-card2 transition-colors"
            >
              <Trash2 size={16} className="text-accent-red" />
              <div>
                <p className="text-sm font-semibold">Delete for everyone</p>
                <p className="text-xs text-text-muted">Remove it from both chats.</p>
              </div>
            </button>
          )}
          <button
            onClick={() => onDelete('me')}
            className="w-full flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left hover:bg-bg-card2 transition-colors"
          >
            <X size={16} className="text-text-muted" />
            <div>
              <p className="text-sm font-semibold">{isMine ? 'Delete for you' : 'Remove for you'}</p>
              <p className="text-xs text-text-muted">Only this device view will hide it.</p>
            </div>
          </button>
        </div>
        <button onClick={onClose} className="w-full rounded-2xl bg-bg-card2 py-3 text-sm font-semibold text-text-muted">
          Cancel
        </button>
      </div>
    </div>
  )
}

function MessageRequestBox({
  otherUser,
  userId,
  onSent,
}: {
  otherUser: any
  userId: string
  onSent: () => void
}) {
  const [requestMessage, setRequestMessage] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)

  async function handleSendRequest() {
    const fallback = `Hi ${otherUser?.display_name || otherUser?.username || 'there'}, I would love to chat.`
    const payload = requestMessage.trim() || fallback
    setSendingRequest(true)
    try {
      await api.post('/api/messages/requests', {
        to_user_id: userId,
        message: payload,
      }, { requireAuth: true })
      toast.success('Message request sent')
      setRequestMessage('')
      onSent()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSendingRequest(false)
    }
  }

  return (
    <div className="border-t border-border bg-bg px-4 py-4">
      <div className="glass-card rounded-[24px] p-4">
        <p className="text-sm font-semibold">Send a message request</p>
        <p className="text-xs text-text-muted mt-1">
          {otherUser?.display_name || 'This user'} needs to accept before the chat opens fully.
        </p>
        <textarea
          value={requestMessage}
          onChange={(event) => setRequestMessage(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Write a short intro..."
          className="input-base mt-3 resize-none text-sm"
        />
        <button
          onClick={handleSendRequest}
          disabled={sendingRequest}
          className="btn-primary mt-3 w-full py-3 text-sm flex items-center justify-center gap-2"
        >
          {sendingRequest && <Loader2 size={15} className="animate-spin" />}
          {sendingRequest ? 'Sending…' : 'Send Request'}
        </button>
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
          <div className="w-[360px] border-r border-border flex flex-col flex-shrink-0 bg-bg-card/40">
            <ConversationList activeUserId={withUser} />
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
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const { data, isLoading, mutate } = useSWR('/api/messages/conversations', swrFetcher, {
    refreshInterval: 4000, revalidateOnFocus: true, keepPreviousData: true })
  const { data: requestsData } = useSWR('/api/messages/requests', swrFetcher, {
    refreshInterval: 15000, revalidateOnFocus: true })
  const conversations: any[] = (data as any)?.data || []
  const requestCount = ((requestsData as any)?.data || []).length

  useEffect(() => {
    const refresh = () => { mutate() }
    window.addEventListener('messages:refresh', refresh)
    return () => window.removeEventListener('messages:refresh', refresh)
  }, [mutate])

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase()
    return conversations.filter((conv: any) => {
      if (tab === 'unread' && conv.unread_count === 0) return false
      if (!q) return true
      const name = `${conv.other_user?.display_name || ''} ${conv.other_user?.username || ''}`.toLowerCase()
      const preview = `${conv.last_message?.preview || getDirectMessagePreview(conv.last_message, null)}`.toLowerCase()
      return name.includes(q) || preview.includes(q)
    })
  }, [conversations, query, tab])

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="px-4 pt-1 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[28px] font-black tracking-tight">Chats</p>
              <p className="text-xs text-text-muted">Messenger-style inbox for your close conversations.</p>
            </div>
            <Link
              href="/messages/requests"
              className="relative w-11 h-11 rounded-full border border-border bg-bg-card2 flex items-center justify-center text-text-muted hover:text-text hover:border-primary/40"
            >
              <MessageCircle size={18} />
              {requestCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {requestCount > 9 ? '9+' : requestCount}
                </span>
              )}
            </Link>
          </div>

          <div className="relative mt-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              className="w-full rounded-full bg-bg-card2 border border-border pl-11 pr-4 py-3 text-sm outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex gap-2 mt-4 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setTab('all')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors',
                tab === 'all' ? 'bg-primary/12 text-primary' : 'bg-bg-card2 text-text-secondary'
              )}
            >
              Inbox
            </button>
            <button
              onClick={() => setTab('unread')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors',
                tab === 'unread' ? 'bg-primary/12 text-primary' : 'bg-bg-card2 text-text-secondary'
              )}
            >
              Unread
            </button>
            <Link
              href="/messages/requests"
              className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap bg-bg-card2 text-text-secondary"
            >
              Requests{requestCount > 0 ? ` (${requestCount})` : ''}
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-bg-card2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-bg-card2 rounded w-28" />
                  <div className="h-2.5 bg-bg-card2 rounded w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
            {query ? 'No chats matched your search' : 'No conversations yet'}
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1.5">
            {filteredConversations.map((conv: any) => (
              <Link
                key={conv.other_user?.id}
                href={`/messages?user=${conv.other_user?.id}`}
                className={cn(
                  'flex items-center gap-3 rounded-[22px] px-3 py-3 transition-colors',
                  activeUserId === conv.other_user?.id ? 'bg-primary/10 border border-primary/15' : 'hover:bg-bg-card2'
                )}
              >
                <div className="relative flex-shrink-0">
                  <Avatar user={conv.other_user} size={48} />
                  {conv.unread_count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary rounded-full text-[10px] text-white flex items-center justify-center font-bold border border-bg px-1">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">
                      {conv.other_user?.display_name || conv.other_user?.username}
                    </p>
                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {formatChatTime(conv.last_message?.created_at)}
                    </span>
                  </div>
                  <p className={cn(
                    'text-xs truncate mt-0.5',
                    conv.unread_count > 0 ? 'text-text font-medium' : 'text-text-muted'
                  )}>
                    {conv.last_message?.preview || getDirectMessagePreview(conv.last_message, null)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

// ── Chat Area ─────────────────────────────────────────────────
function ChatArea({ userId }: { userId: string }) {
  const { profile } = useAuth()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [selectedMedia, setSelectedMedia] = useState<PendingMedia[]>([])
  const [activeMessage, setActiveMessage] = useState<any | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<any>(null)
  const selectedMediaRef = useRef<PendingMedia[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [otherTyping, setOtherTyping] = useState(false)
  const [myTyping, setMyTyping] = useState(false)

  const chatParams = useSearchParams()
  const autoAnswer = chatParams.get('action') === 'answer'
  const autoCallType = (chatParams.get('type') || 'audio') as 'audio' | 'video'

  const { data: userRes } = useSWR(`/api/users/${userId}`, swrFetcher)
  const { data: msgsRes, mutate } = useSWR(
    `/api/messages/thread/${userId}`, swrFetcher,
    { revalidateOnFocus: true, refreshInterval: 2500, keepPreviousData: true }
  )
  const { data: permRes, mutate: mutatePermission } = useSWR(
    `/api/messages/permission?user_id=${userId}`, fetcher,
    { revalidateOnFocus: false }
  )

  const otherUser = (userRes as any)?.data
  const messages: any[] = (msgsRes as any)?.data || []
  const dmPermission: string = (permRes as any)?.permission || 'free'

  const call = useCall(profile?.id ?? null, userId)

  useEffect(() => {
    selectedMediaRef.current = selectedMedia
  }, [selectedMedia])

  useEffect(() => {
    return () => {
      selectedMediaRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      recordStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (autoAnswer && call.callState === 'idle' && profile?.id) {
      const t = setTimeout(() => {
        call.setIncomingCall(autoCallType)
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [autoAnswer, autoCallType, call.callState, profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = messagesRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsNearBottom(distFromBottom < 100)
  }

  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isNearBottom])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' } as any)
  }, [userId])

  useEffect(() => {
    if (!profile?.id) return
    const channelId = [profile.id, userId].sort().join('-')

    const channel = supabase.channel(`dm:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`,
      }, (payload: any) => {
        if (payload.new?.sender_id === userId) mutate()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`,
      }, () => mutate())
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.user_id !== profile.id) {
          setOtherTyping(true)
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

  function clearSelectedMedia() {
    setSelectedMedia((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      return []
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeSelectedMedia(id: string) {
    setSelectedMedia((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  function appendEmoji(emoji: string) {
    const textarea = textareaRef.current
    if (!textarea) {
      handleTyping(`${message}${emoji}`)
      return
    }

    const start = textarea.selectionStart ?? message.length
    const end = textarea.selectionEnd ?? message.length
    const nextValue = `${message.slice(0, start)}${emoji}${message.slice(end)}`
    handleTyping(nextValue)

    requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current
      if (!nextTextarea) return
      const nextPos = start + emoji.length
      nextTextarea.focus()
      nextTextarea.setSelectionRange(nextPos, nextPos)
    })
  }

  async function startVoiceRecording() {
    if (isRecording || sending || uploading) return
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice recording is not supported on this device')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordStreamRef.current = stream
      recordChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordChunksRef.current.push(event.data)
        }
      }
      recorder.start()
      setRecordingSec(0)
      setIsRecording(true)
      setEmojiOpen(false)
      recordTimerRef.current = setInterval(() => {
        setRecordingSec((value) => value + 1)
      }, 1000)
    } catch (error) {
      toast.error('Microphone permission is required for voice messages')
    }
  }

  async function stopVoiceRecording(save: boolean) {
    const recorder = recorderRef.current
    if (!recorder) return

    const finalize = async () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current)
        recordTimerRef.current = null
      }
      setIsRecording(false)

      const stream = recordStreamRef.current
      stream?.getTracks().forEach((track) => track.stop())
      recordStreamRef.current = null
      recorderRef.current = null

      if (!save) {
        recordChunksRef.current = []
        setRecordingSec(0)
        return
      }

      const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      recordChunksRef.current = []
      if (!blob.size) {
        toast.error('Voice recording was empty')
        setRecordingSec(0)
        return
      }

      const ext = (recorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: recorder.mimeType || 'audio/webm' })
      const previewUrl = URL.createObjectURL(blob)
      setSelectedMedia((current) => {
        if (current.length >= 8) {
          URL.revokeObjectURL(previewUrl)
          toast.error('You can send up to 8 attachments at once')
          return current
        }
        return [...current, {
          id: `${file.name}-${Date.now()}`,
          file,
          previewUrl,
          type: 'audio',
          durationSec: recordingSec,
        }]
      })
      setRecordingSec(0)
    }

    recorder.onstop = () => { finalize() }
    recorder.stop()
  }

  async function handleMediaSelection(fileList: FileList | null) {
    if (!fileList) return
    const nextFiles = Array.from(fileList)
    if (selectedMedia.length + nextFiles.length > 8) {
      toast.error('You can send up to 8 attachments at once')
    }

    const limited = nextFiles.slice(0, Math.max(0, 8 - selectedMedia.length))
    if (!limited.length) return

    const { validateVideo } = await import('@/lib/media')
    const nextItems: PendingMedia[] = []

    for (const file of limited) {
      if (file.type.startsWith('image/')) {
        nextItems.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          type: 'image',
        })
        continue
      }

      if (file.type.startsWith('video/')) {
        const valid = await validateVideo(file)
        if (!valid.ok) {
          toast.error(valid.error || 'Invalid video file')
          continue
        }
        nextItems.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          type: 'video',
        })
        continue
      }

      toast.error(`Unsupported file: ${file.name}`)
    }

    setSelectedMedia((current) => [...current, ...nextItems])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function sendCurrentMessage(overrideText?: string) {
    const content = overrideText ?? message.trim()
    if ((!content && selectedMedia.length === 0) || sending || uploading) return

    setSending(true)
    setUploading(selectedMedia.length > 0)
    const previousText = message
    const previousMedia = selectedMedia
    setMessage('')
    channelRef.current?.send({ type: 'broadcast', event: 'stop-typing', payload: { user_id: profile?.id } })

    try {
      const { compressImage } = await import('@/lib/media')
      const attachments: Array<{ type: 'image' | 'video' | 'audio'; url: string; thumbnail_url?: string | null; duration_sec?: number | null }> = []

      for (const item of previousMedia) {
        let fileToUpload = item.file
        if (item.type === 'image' && !item.file.type.includes('gif')) {
          try {
            const compressed = await compressImage(item.file)
            fileToUpload = compressed.file
          } catch {}
        }

        const uploadType = item.type === 'video' ? 'videos' : item.type === 'audio' ? 'audio' : 'images'
        const uploadResult = await uploadToImageKit(fileToUpload, uploadType)
        attachments.push({
          type: item.type,
          url: uploadResult.url,
          thumbnail_url: item.type === 'video' ? (uploadResult.thumbnailUrl || null) : null,
          duration_sec: item.type === 'audio' ? (item.durationSec || null) : null,
        })
      }

      const payload = {
        to_user_id: userId,
        content,
        attachments,
      }

      const validation = validate(sendMessageSchema, payload)
      if (!validation.success) {
        toast.error(validation.error)
        setMessage(previousText)
        setSelectedMedia(previousMedia)
        return
      }

      await api.post('/api/messages/send', payload, { requireAuth: true, timeout: 45000 })
      analytics.track('message_send')
      mutate()
      window.dispatchEvent(new Event('messages:refresh'))
      clearSelectedMedia()
    } catch (e: any) {
      const code = e?.response?.data?.code || e?.code
      if (code === 'REQUEST_REQUIRED') {
        toast.error('Follow or send a message request first', { duration: 4000 })
        mutatePermission()
      } else if (code === 'REQUEST_PENDING') {
        toast('Your message request is pending their approval ⏳', { duration: 4000 })
      } else if (code === 'MESSAGING_SQL_REQUIRED') {
        toast.error('Run the latest messaging SQL migration first')
      } else {
        toast.error(getErrorMessage(e))
      }
      setMessage(previousText)
      setSelectedMedia(previousMedia)
    } finally {
      setSending(false)
      setUploading(false)
    }
  }

  async function deleteMessage(messageId: string, scope: 'me' | 'everyone') {
    try {
      await apiFetch('/api/messages/send', {
        method: 'DELETE',
        body: JSON.stringify({
          message_id: messageId,
          scope,
        }),
        requireAuth: true,
      })
      mutate()
      window.dispatchEvent(new Event('messages:refresh'))
      setActiveMessage(null)
      toast.success(scope === 'everyone' ? 'Message removed for everyone' : 'Message removed for you')
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const composerEnabled = dmPermission === 'free' || dmPermission === 'request_accepted'
  const hasComposerContent = Boolean(message.trim() || selectedMedia.length > 0)

  return (
    <div className="flex flex-col h-full relative bg-bg">
      <CallOverlay call={call} otherUser={otherUser} />

      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0 bg-bg/95 backdrop-blur-xl">
        <Link href="/messages" className="text-text-muted hover:text-text transition-colors flex-shrink-0 lg:hidden">
          <ArrowLeft size={20} />
        </Link>
        {otherUser ? (
          <>
            <Avatar user={otherUser} size={42} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">
                {otherUser.display_name || otherUser.full_name || otherUser.username}
              </div>
              {otherTyping ? (
                <div className="text-xs text-primary animate-pulse">typing…</div>
              ) : (
                <div className="text-xs text-text-muted">
                  {dmPermission === 'free' ? 'You can message freely' : `@${otherUser.username}`}
                </div>
              )}
            </div>
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
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40',
                  dmPermission === 'free'
                    ? 'bg-bg-card2 text-text-muted hover:text-primary hover:bg-primary-muted'
                    : 'bg-bg-card2 text-text-muted/40 cursor-not-allowed'
                )}
              >
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
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40',
                  dmPermission === 'free'
                    ? 'bg-bg-card2 text-text-muted hover:text-primary hover:bg-primary-muted'
                    : 'bg-bg-card2 text-text-muted/40 cursor-not-allowed'
                )}
              >
                <Video size={16} />
              </button>
              <Link href={`/profile/${otherUser.id}`}
                className="w-10 h-10 rounded-full bg-bg-card2 flex items-center justify-center text-text-muted hover:text-text transition-colors"
                title="View profile">
                <MoreVertical size={16} />
              </Link>
            </div>
          </>
        ) : (
          <div className="h-4 w-24 bg-bg-card2 rounded animate-pulse" />
        )}
      </div>

      <div
        ref={messagesRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-5 hide-scrollbar bg-[radial-gradient(circle_at_top,_rgba(108,99,255,0.06),_transparent_40%)]"
      >
        {otherUser && (
          <div className="flex flex-col items-center text-center px-6 py-5 mb-5">
            <Avatar user={otherUser} size={72} />
            <p className="mt-3 font-semibold">{otherUser.display_name || otherUser.username}</p>
            <p className="text-xs text-text-muted mt-1">@{otherUser.username}</p>
            <Link href={`/profile/${otherUser.id}`} className="text-xs text-primary mt-2">
              View profile
            </Link>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center py-10 text-text-muted text-sm">Say hello! 👋</div>
        ) : messages.map((msg: any, index: number) => {
          const isMine = msg.sender_id === profile?.id
          const attachments = normalizeDirectMessageAttachments(msg)
          const showDay = index === 0 || formatDayLabel(messages[index - 1]?.created_at) !== formatDayLabel(msg.created_at)
          const deletedForEveryone = isDirectMessageDeletedForEveryone(msg) || msg.content === 'Message deleted'
          const previewText = deletedForEveryone
            ? (isMine ? 'You removed a message' : 'Message removed')
            : msg.content

          return (
            <div key={msg.id} className="mb-3">
              {showDay && (
                <div className="flex justify-center mb-4">
                  <span className="px-3 py-1 rounded-full bg-bg-card2 border border-border text-[11px] text-text-muted">
                    {formatDayLabel(msg.created_at)}
                  </span>
                </div>
              )}

              <div className={cn('flex gap-2 items-end group', isMine ? 'justify-end' : 'justify-start')}>
                {!isMine && <Avatar user={msg.sender} size={28} className="flex-shrink-0 mb-1" />}

                {!isMine && (
                  <button
                    onClick={() => setActiveMessage(msg)}
                    className="self-center opacity-60 lg:opacity-0 lg:group-hover:opacity-100 text-text-muted hover:text-text transition-opacity"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}

                <div className={cn('max-w-[84%] sm:max-w-[74%]')}>
                  <div
                    className={cn(
                      'rounded-[24px] px-3 py-2.5 shadow-sm',
                      isMine ? 'bg-primary text-white rounded-br-[10px]' : 'bg-bg-card border border-border text-text rounded-bl-[10px]'
                    )}
                  >
                    {!deletedForEveryone && attachments.length > 0 && (
                      <MessageAttachments attachments={attachments} isMine={isMine} />
                    )}

                    {previewText ? (
                      <p className={cn('text-sm leading-relaxed whitespace-pre-wrap break-words', deletedForEveryone && 'italic opacity-80')}>
                        {previewText}
                      </p>
                    ) : null}

                    {!previewText && !attachments.length && (
                      <p className={cn('text-sm italic opacity-80')}>
                        {deletedForEveryone ? 'Message removed' : 'Attachment'}
                      </p>
                    )}
                  </div>

                  <div className={cn(
                    'flex items-center gap-1.5 text-[10px] mt-1 px-1',
                    isMine ? 'justify-end text-text-muted' : 'justify-start text-text-muted'
                  )}>
                    <span>{formatChatTime(msg.created_at)}</span>
                    {isMine && !deletedForEveryone && (
                      msg.is_read ? <CheckCheck size={11} className="text-accent-green" /> : <Check size={11} />
                    )}
                  </div>
                </div>

                {isMine && (
                  <button
                    onClick={() => setActiveMessage(msg)}
                    className="self-center opacity-60 lg:opacity-0 lg:group-hover:opacity-100 text-text-muted hover:text-text transition-opacity"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {otherTyping && (
          <div className="flex gap-2 items-end mt-3">
            <Avatar user={otherUser} size={28} className="flex-shrink-0 mb-1" />
            <div className="bg-bg-card border border-border rounded-[22px] rounded-bl-[10px] px-4 py-2.5">
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!isNearBottom && messages.length > 0 && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-28 right-4 bg-primary text-white text-xs px-3 py-1.5 rounded-full shadow-lg"
        >
          ↓ New messages
        </button>
      )}

      {dmPermission === 'request_needed' ? (
        <MessageRequestBox otherUser={otherUser} userId={userId} onSent={() => mutatePermission()} />
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
        <div className="relative border-t border-border bg-bg/95 backdrop-blur-xl px-4 py-3">
          {emojiOpen && (
            <div className="absolute bottom-[100%] left-4 right-4 mb-3 glass-card rounded-[24px] p-4 shadow-2xl z-20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Emoji</p>
                <button onClick={() => setEmojiOpen(false)} className="text-text-muted hover:text-text">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4 max-h-64 overflow-y-auto hide-scrollbar pr-1">
                {EMOJI_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-2">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                      {group.items.map((emoji) => (
                        <button
                          key={`${group.title}-${emoji}`}
                          onClick={() => appendEmoji(emoji)}
                          className="h-10 rounded-2xl bg-bg-card2 hover:bg-primary/10 text-xl transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedMedia.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar">
              {selectedMedia.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'relative rounded-[18px] overflow-hidden border border-border bg-bg-card2 flex-shrink-0',
                    item.type === 'audio' ? 'w-44 min-h-[112px] p-3' : 'w-24 h-24'
                  )}
                >
                  {item.type === 'video' ? (
                    <video src={item.previewUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : item.type === 'audio' ? (
                    <div className="w-full h-full flex flex-col justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                        <Mic size={13} />
                        <span>Voice</span>
                      </div>
                      <audio src={item.previewUrl} controls className="w-full" />
                      <span className="text-[10px] text-text-muted">{formatAudioDuration(item.durationSec)}</span>
                    </div>
                  ) : (
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => removeSelectedMedia(item.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => handleMediaSelection(event.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || uploading || !composerEnabled}
              className="w-11 h-11 rounded-full bg-bg-card2 border border-border disabled:opacity-40 flex items-center justify-center text-text-muted hover:text-primary transition-all flex-shrink-0"
              title="Add photos or videos"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={18} />}
            </button>

            <button
              onClick={() => isRecording ? stopVoiceRecording(true) : startVoiceRecording()}
              disabled={sending || uploading || !composerEnabled}
              className={cn(
                'w-11 h-11 rounded-full border flex items-center justify-center transition-all flex-shrink-0',
                isRecording
                  ? 'bg-accent-red text-white border-accent-red'
                  : 'bg-bg-card2 border-border text-text-muted hover:text-primary'
              )}
              title={isRecording ? 'Stop recording' : 'Record voice message'}
            >
              {isRecording ? <Square size={16} /> : <Mic size={18} />}
            </button>

            <div className="flex-1 rounded-[28px] bg-bg-card2 border border-border px-3 py-2 flex items-end gap-2">
              <button
                onClick={() => setEmojiOpen((value) => !value)}
                disabled={sending || uploading || isRecording || !composerEnabled}
                className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-primary transition-colors flex-shrink-0"
                title="Open emoji picker"
              >
                <Smile size={18} />
              </button>

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => handleTyping(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendCurrentMessage()
                  }
                }}
                placeholder={isRecording ? 'Recording voice message…' : uploading ? 'Uploading attachments...' : 'Aa'}
                rows={1}
                maxLength={1000}
                disabled={isRecording}
                className="flex-1 bg-transparent text-sm outline-none resize-none max-h-32 py-2 leading-5 placeholder:text-text-muted"
              />
            </div>

            <button
              onClick={() => hasComposerContent ? sendCurrentMessage() : sendCurrentMessage('👍')}
              disabled={sending || uploading || isRecording || !composerEnabled}
              className={cn(
                'w-11 h-11 rounded-full flex items-center justify-center text-white transition-all flex-shrink-0',
                hasComposerContent ? 'bg-primary' : 'bg-primary/90'
              )}
              title={hasComposerContent ? 'Send message' : 'Quick like'}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : hasComposerContent ? <Send size={16} /> : <ThumbsUp size={18} />}
            </button>
          </div>

          {isRecording && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-accent-red/30 bg-accent-red/10 px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-text">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-pulse" />
                Recording voice message
                <span className="text-text-muted">{formatAudioDuration(recordingSec)}</span>
              </div>
              <button
                onClick={() => stopVoiceRecording(false)}
                className="text-xs font-semibold text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <MessageActionsSheet
        message={activeMessage}
        currentUserId={profile?.id}
        onClose={() => setActiveMessage(null)}
        onDelete={(scope) => deleteMessage(activeMessage?.id, scope)}
      />
    </div>
  )
}
