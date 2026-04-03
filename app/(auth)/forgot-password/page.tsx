'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import BrandLogo from '@/components/ui/BrandLogo'
import { Mail, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password` })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="mb-2 block"><BrandLogo size="md" /></Link>
        </div>
        <div className="glass-card p-6">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle size={40} className="text-accent-green mx-auto mb-3" />
              <h2 className="font-bold text-lg mb-2">Check your email</h2>
              <p className="text-sm text-text-secondary">We sent a reset link to <strong>{email}</strong></p>
              <Link href="/login" className="btn-primary text-sm mt-4 inline-flex">Back to Login</Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-2">Reset password</h2>
              <p className="text-sm text-text-secondary mb-5">Enter your email and we'll send a reset link.</p>
              {error && <div className="text-xs text-accent-red bg-accent-red/10 px-3 py-2 rounded-lg mb-3">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address" required className="input-base pl-9 text-sm" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Send Reset Link
                </button>
              </form>
              <p className="text-center mt-4">
                <Link href="/login" className="text-sm text-primary hover:underline">Back to login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
