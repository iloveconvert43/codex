'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BrandLogo from '@/components/ui/BrandLogo'
import {
  User, Mail, Lock, Phone, Calendar, AlertCircle,
  Loader2, Eye, EyeOff, CheckCircle, ChevronRight
} from 'lucide-react'
import type { Gender } from '@/types'
import OTPVerifyStep from './OTPVerifyStep'

// Password strength
function passwordStrength(pw: string) {
  let s = 0
  if (pw.length >= 8)  s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ['', 'Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'bg-accent-red', 'bg-orange-500', 'bg-accent-yellow', 'bg-blue-500', 'bg-accent-green']
  const text =   ['', 'text-accent-red', 'text-orange-400', 'text-accent-yellow', 'text-blue-400', 'text-accent-green']
  return { score: s, label: labels[s] || '', barColor: colors[s] || '', textColor: text[s] || '' }
}

interface FormData {
  full_name: string
  identifier: string   // email OR phone — user picks
  password: string
  dob: string
  gender: Gender | ''
}

export default function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/'

  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmPw, setConfirmPw] = useState('')
  const [otpChannel, setOtpChannel] = useState<'email' | 'phone'>('email')

  const [form, setForm] = useState<FormData>({
    full_name: '',
    identifier: '',
    password: '',
    dob: '',
    gender: '' })

  function setField(k: keyof FormData, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    setError('')
  }

  function getAge(dob: string): number {
    if (!dob) return 0
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000))
  }

  function validate(): string | null {
    if (!form.full_name.trim() || form.full_name.trim().length < 2)
      return 'Full name must be at least 2 characters'
    if (!form.identifier.trim())
      return 'Email address or phone number is required'
    const trimId = form.identifier.trim()
    const isEmailInput = trimId.includes('@')
    const isPhoneInput = /^[+\d]/.test(trimId) && !trimId.includes('@')
    if (isEmailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimId))
      return 'Enter a valid email address (e.g. name@gmail.com)'
    if (!isEmailInput && !isPhoneInput)
      return 'Enter a valid email address or 10-digit Indian mobile number'
    if (!form.dob)
      return 'Date of birth is required'
    const age = getAge(form.dob)
    if (age < 13) return 'You must be at least 13 years old to sign up'
    if (age > 120) return 'Please enter a valid date of birth'
    if (!form.password || form.password.length < 8)
      return 'Password must be at least 8 characters'
    if (form.password !== confirmPw)
      return 'Passwords do not match'
    if (passwordStrength(form.password).score < 2)
      return 'Password is too weak. Add uppercase letters, numbers, or symbols.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          identifier: form.identifier.trim(),
          password: form.password,
          dob: form.dob,
          gender: form.gender || null }) })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send verification code')
        return
      }

      setOtpChannel(data.channel || 'email')
      setStep('otp')
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerified() {
    // OTP verified + account created — auto sign in
    const { supabase } = await import('@/lib/supabase')
    const trimmedId = form.identifier.trim()
    const isPhone = /^[\+\d]/.test(trimmedId) && !/[@.]/.test(trimmedId)

    const normalizePhone = (p: string) => `+91${p.replace(/^\+91/, '').replace(/\D/g, '')}`
    const loginEmail = isPhone
      ? `${normalizePhone(trimmedId).replace('+', '')}@phone.tryhushly.app`
      : trimmedId.toLowerCase()

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: form.password })

    if (signInErr) {
      // Auto-login failed after OTP — show message, let user login manually
      const toast2 = (await import('react-hot-toast')).default
      toast2.success('Account created! Please sign in.')
      router.push('/login?registered=1')
      return
    }

    // Wait for Zustand store to have profile — guarantees feed loads immediately
    const { useUserStore } = await import('@/store/userStore')
    await useUserStore.getState().waitForAuth()

    const toast = (await import('react-hot-toast')).default
    toast.success('Welcome to tryHushly! 🎉')
    // Use window.location for reliable full-page navigation after signup
    // router.replace() sometimes doesn't trigger re-render, causing spinner to persist
    window.location.replace(redirect)
  }

  if (step === 'otp') {
    return (
      <OTPVerifyStep
        identifier={form.identifier.trim()}
        channel={otpChannel}
        formData={{
          full_name: form.full_name.trim(),
          password: form.password,
          dob: form.dob,
          gender: form.gender || null }}
        onVerified={handleVerified}
        onBack={() => setStep('form')}
      />
    )
  }

  const pw = passwordStrength(form.password)
  const age = getAge(form.dob)

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-7">
          <Link href="/login">
            <BrandLogo size="lg" />
          </Link>
          <p className="text-text-secondary mt-2 text-sm">Create your account — it's free</p>
        </div>

        <div className="glass-card p-7 shadow-card">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">1</div>
              <span className="text-xs text-primary font-medium">Your Details</span>
            </div>
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="text-xs text-text-muted">Verify</span>
              <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-text-muted text-xs font-bold">2</div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-accent-red/10 border border-accent-red/25 text-accent-red px-4 py-3 rounded-xl mb-5 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Full Name <span className="text-accent-red">*</span>
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="text" value={form.full_name}
                  onChange={e => setField('full_name', e.target.value)}
                  placeholder="Your full name" autoComplete="name" autoFocus
                  className="input-base pl-10 text-sm" />
              </div>
            </div>

            {/* Email or Phone */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Email Address or Phone Number <span className="text-accent-red">*</span>
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="text" inputMode="email" value={form.identifier}
                  onChange={e => setField('identifier', e.target.value)}
                  placeholder="you@example.com  or  9876543210"
                  autoComplete="email"
                  className="input-base pl-10 text-sm" />
              </div>
              <p className="text-xs text-text-muted mt-1">
                We'll send a verification code to confirm this
              </p>
            </div>

            {/* DOB + Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Date of Birth <span className="text-accent-red">*</span>
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="date" value={form.dob}
                    onChange={e => setField('dob', e.target.value)}
                    max={new Date(Date.now() - 13 * 365.25 * 86400000).toISOString().split('T')[0]}
                    className="input-base pl-9 text-sm" />
                </div>
                {form.dob && age >= 13 && (
                  <p className="text-xs text-text-muted mt-1">Age: {age}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Gender
                </label>
                <select value={form.gender} onChange={e => setField('gender', e.target.value)}
                  className="input-base text-sm appearance-none">
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Password <span className="text-accent-red">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => setField('password', e.target.value)}
                  placeholder="Min. 8 characters" autoComplete="new-password"
                  className="input-base pl-10 pr-11 text-sm" />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= pw.score ? pw.barColor : 'bg-border'}`} />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${pw.textColor}`}>{pw.label}</p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Confirm Password <span className="text-accent-red">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type={showConfirm ? 'text' : 'password'} value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setError('') }}
                  placeholder="Repeat your password" autoComplete="new-password"
                  className={`input-base pl-10 pr-11 text-sm ${confirmPw && form.password !== confirmPw ? 'border-accent-red' : ''}`} />
                <button type="button" tabIndex={-1} onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPw && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${form.password === confirmPw ? 'text-accent-green' : 'text-accent-red'}`}>
                  {form.password === confirmPw
                    ? <><CheckCircle size={11} /> Passwords match</>
                    : <><AlertCircle size={11} /> Passwords don't match</>
                  }
                </p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 font-semibold text-[15px] flex items-center justify-center gap-2 mt-1">
              {loading
                ? <><Loader2 size={18} className="animate-spin" /> Sending code…</>
                : <><ChevronRight size={18} /> Continue — Verify</>}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-text-secondary mt-5">
          Already have an account?{' '}
          <Link href={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
            className="text-primary font-semibold hover:underline">Log In</Link>
        </p>
        <p className="text-center text-xs text-text-muted mt-3">
          By signing up, you agree to our{' '}
          <Link href="/terms" className="text-primary hover:underline">Terms</Link> &{' '}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  )
}
