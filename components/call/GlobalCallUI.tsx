'use client'

/**
 * components/call/GlobalCallUI.tsx
 * Shows incoming call overlay on ANY page
 * Mount once in root layout
 */
import { useGlobalCallListener } from '@/hooks/useGlobalCallListener'
import { Phone, Video, X } from 'lucide-react'

export default function GlobalCallUI() {
  const { incomingCall, acceptCall, declineCall } = useGlobalCallListener()

  if (!incomingCall) return null

  const isVideo = incomingCall.callType === 'video'

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg border border-border rounded-3xl w-full max-w-xs p-6 shadow-2xl animate-slide-up">
        {/* Caller info */}
        <div className="flex flex-col items-center gap-3 mb-6">
          {/* Avatar with ringing animation */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-primary/40 flex-shrink-0">
              {incomingCall.callerAvatar ? (
                <img src={incomingCall.callerAvatar} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-accent-red flex items-center justify-center text-white text-2xl font-bold">
                  {incomingCall.callerName[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="font-bold text-lg">{incomingCall.callerName}</p>
            <p className="text-sm text-text-muted animate-pulse">
              {isVideo ? '📹 Incoming video call…' : '📞 Incoming call…'}
            </p>
          </div>
        </div>

        {/* Accept / Decline buttons */}
        <div className="flex items-center justify-center gap-8">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform hover:bg-red-600">
              <Phone size={22} className="rotate-[135deg]" />
            </button>
            <span className="text-xs text-text-muted">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform hover:bg-green-600">
              {isVideo ? <Video size={22} /> : <Phone size={22} />}
            </button>
            <span className="text-xs text-text-muted">Accept</span>
          </div>
        </div>

        {/* Dismiss silently */}
        <button
          onClick={declineCall}
          className="absolute top-3 right-3 text-text-muted hover:text-text p-1">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
