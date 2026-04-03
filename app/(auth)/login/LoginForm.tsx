'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BrandLogo from '@/components/ui/BrandLogo'
import { Loader2, Eye, EyeOff, AlertCircle, AtSign, Lock, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type AlertType = 'error' | 'warning' | 'info'

interface AlertBanner {
  type: AlertType
  message: string
  subtext?: string
}

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/'
  const registered = params.get('registered') === '1'

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<AlertBanner | null>(
    params.get('error') === 'auth_failed'
      ? { type: 'error', message: 'Session expired. Please log in again.' }
      : registered
        ? { type: 'info', message: 'Account created! Please log in.' }
        : null
  )

  function clearAlert() { setAlert(null) }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearAlert()

    const id = identifier.trim()
    if (!id) { setAlert({ type: 'error', message: 'Enter your email or phone number' }); return }
    if (!password) { setAlert({ type: 'error', message: 'Enter your password' }); return }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id, password }) })
      const data = await res.json()

      if (!res.ok) {
        switch (data.code) {
          case 'ACCOUNT_LOCKED':
            setAlert({
              type: 'warning',
              message: 'Account temporarily locked.',
              subtext: data.error
            })
            break
          case 'IP_RATE_LIMITED':
            setAlert({ type: 'warning', message: data.error })
            break
          case 'EMAIL_NOT_VERIFIED':
            setAlert({
              type: 'info',
              message: 'Email not verified.',
              subtext: 'Please check your email and verify before logging in.'
            })
            break
          case 'INVALID_CREDENTIALS':
            setAlert({
              type: 'error',
              message: 'Incorrect email/phone or password.',
              subtext: data.attemptsRemaining > 0
                ? `${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} remaining before account lock.`
                : undefined
            })
            break
          default:
            setAlert({ type: 'error', message: data.error || 'Login failed. Try again.' })
        }
        setLoading(false)
        return
      }

      // Set session — wait for auth state to propagate before navigating
      if (data.access_token && data.refresh_token) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })
        if (sessionErr) {
          setAlert({ type: 'error', message: 'Login failed. Please try again.' })
          setLoading(false)
          return
        }
      }

      // Wait for Zustand store to have profile loaded
      // Uses waitForAuth() which resolves when initialized=true AND loading=false
      const { useUserStore } = await import('@/store/userStore')
      await useUserStore.getState().waitForAuth()

      // Use window.location for reliable full-page navigation after login
      // router.replace() sometimes doesn't trigger re-render of the target page's hooks,
      // causing the spinner to persist until manual refresh
      window.location.replace(redirect)

    } catch {
      setAlert({ type: 'error', message: 'Network error. Please check your connection.' })
      setLoading(false)
    }
  }

  const alertColors: Record<AlertType, string> = {
    error: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
    warning: 'bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow',
    info: 'bg-primary/10 border-primary/30 text-primary' }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <BrandLogo size="lg" />
          </Link>
          <p className="text-text-secondary mt-2 text-base">Say what you can't say anywhere else.</p>
        </div>

        {/* Login card */}
        <div className="glass-card p-8 mb-4 shadow-card">

          {/* Alert banner */}
          {alert && (
            <div className={`flex items-start gap-2.5 border px-4 py-3.5 rounded-xl mb-6 ${alertColors[alert.type]}`}>
              {alert.type === 'warning'
                ? <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
              <div>
                <p className="text-sm font-medium">{alert.message}</p>
                {alert.subtext && <p className="text-xs mt-0.5 opacity-80">{alert.subtext}</p>}
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate className="space-y-4">
            {/* Identifier */}
            <div>
              <label htmlFor="identifier" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Email or Phone Number
              </label>
              <div className="relative">
                <AtSign size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  id="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); clearAlert() }}
                  placeholder="you@example.com or 9876543210"
                  className="input-base pl-10 text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearAlert() }}
                  placeholder="Your password"
                  className="input-base pl-10 pr-11 text-sm"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 text-[15px] font-semibold flex items-center justify-center gap-2 mt-2">
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Log In'}
            </button>
          </form>
        </div>

        {/* Create account */}
        <div className="glass-card p-5 text-center border-border/80">
          <p className="text-sm text-text-secondary mb-3">Don't have an account?</p>
          <Link
            href={`/signup${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
            className="btn-primary inline-flex items-center gap-2 px-8 py-2.5 text-sm"
          >
            Create New Account
          </Link>
        </div>

        <p className="text-center text-xs text-text-muted mt-5">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-primary hover:underline">Terms</Link> and{' '}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
