'use client'

export const dynamic = 'force-dynamic'

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center text-center px-8">
      <div className="text-6xl mb-6">📡</div>
      <h1 className="text-2xl font-bold mb-3">You're offline</h1>
      <p className="text-text-secondary text-sm leading-relaxed mb-6 max-w-xs">
        No internet connection. Some cached content may still be available.
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary">
        Try again
      </button>
    </div>
  )
}
