'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home } from 'lucide-react'

export default function ErrorPage({
  error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to monitoring service in production
    console.error('[App Error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center">
      <span className="text-6xl mb-6">😕</span>
      <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
      <p className="text-sm text-text-muted max-w-xs mb-8 leading-relaxed">
        tryHushly ran into an unexpected error. Please try again or go back to the feed.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={reset} className="btn-primary flex items-center justify-center gap-2 py-3">
          <RefreshCw size={16} /> Try Again
        </button>
        <Link href="/" className="btn-ghost flex items-center justify-center gap-2 py-3">
          <Home size={16} /> Go to Feed
        </Link>
      </div>
    </div>
  )
}
