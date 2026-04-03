'use client'

import Link from 'next/link'
import { Home, ArrowLeft, Search } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <span className="text-5xl">🤫</span>
      </div>
      <h1 className="text-4xl font-black gradient-text mb-2">404</h1>
      <h2 className="text-xl font-bold mb-3">This page doesn't exist</h2>
      <p className="text-sm text-text-muted max-w-xs mb-8 leading-relaxed">
        The link may be broken, or the page may have been removed. Try going back or searching for what you need.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link href="/" className="btn-primary flex items-center justify-center gap-2 py-3">
          <Home size={16} /> Go to Feed
        </Link>
        <Link href="/search" className="btn-ghost flex items-center justify-center gap-2 py-3">
          <Search size={16} /> Search tryHushly
        </Link>
        <button onClick={() => history.back()}
          className="flex items-center justify-center gap-2 py-3 text-sm text-text-muted hover:text-text transition-colors">
          <ArrowLeft size={14} /> Go back
        </button>
      </div>
    </div>
  )
}
