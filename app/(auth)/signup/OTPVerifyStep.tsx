'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Loader2, RefreshCw, CheckCircle, AlertCircle, Mail, Phone } from 'lucide-react'
import BrandLogo from '@/components/ui/BrandLogo'
import toast from 'react-hot-toast'

interface Props {
  identifier: string
  channel: 'email' | 'phone'
  formData: {
    full_name: string
    password: string
    dob: string
    gender: string | null
    username?: string
    nationality?: string
  }
  onVerified: () => void
  onBack: () => void
}

export default function OTPVerifyStep({ identifier, channel, formData, onVerified, onBack }: Props) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(60)
  const [done, setDone] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    setTimeout(() => inputs.current[0]?.focus(), 80)
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function input(i: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[i] = d; setOtp(next); setError('')
    if (d && i < 5) inputs.current[i + 1]?.focus()
    if (d && i === 5 && next.every(x => x)) verify(next.join(''))
  }

  function keydown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      const n = [...otp]; n[i - 1] = ''; setOtp(n)
      inputs.current[i - 1]?.focus()
    }
  }

  function paste(e: React.ClipboardEvent) {
    e.preventDefault()
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (p.length === 6) { setOtp(p.split('')); inputs.current[5]?.focus(); verify(p) }
  }

  async function verify(code?: string) {
    const otpCode = code || otp.join('')
    if (otpCode.length !== 6) { setError('Enter all 6 digits'); return }
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/auth/register/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp: otpCode,
          formData }) })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Verification failed')
        if (res.status === 429 || data.error?.includes('Too many')) {
          setOtp(['', '', '', '', '', ''])
          inputs.current[0]?.focus()
        }
        return
      }

      setDone(true)
      setTimeout(onVerified, 1500)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    if (countdown > 0) return
    try {
      const res = await fetch('/api/auth/register/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name,
          identifier: identifier.trim(),
          password: formData.password,
          dob: formData.dob,
          gender: formData.gender }) })
      const data = await res.json()
      if (res.ok) {
        toast.success('New code sent!')
        setOtp(['', '', '', '', '', '']); setError(''); setCountdown(60)
        setTimeout(() => inputs.current[0]?.focus(), 80)
      } else {
        toast.error(data.error || 'Failed to resend')
      }
    } catch { toast.error('Network error') }
  }

  // Mask identifier for display
  const maskedId = channel === 'email'
    ? identifier.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '****' + c)
    : identifier.slice(0, 4) + '****' + identifier.slice(-2)

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        <div className="text-center mb-7">
          <BrandLogo size="lg" />
          <p className="text-text-secondary mt-2 text-sm">Almost there!</p>
        </div>

        <div className="glass-card p-7 shadow-card">
          <button onClick={onBack}
            className="flex items-center gap-2 text-text-muted hover:text-text text-sm mb-6 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full bg-accent-green/20 border-2 border-accent-green flex items-center justify-center">
                <CheckCircle size={14} className="text-accent-green" />
              </div>
              <span className="text-xs text-accent-green font-medium">Details</span>
            </div>
            <div className="flex-1 h-px bg-primary" />
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="text-xs text-primary font-medium">Verify</span>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">2</div>
            </div>
          </div>

          {/* Channel badge */}
          <div className="flex items-center gap-3 bg-bg-card2 border border-border rounded-xl px-4 py-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              {channel === 'email'
                ? <Mail size={17} className="text-primary" />
                : <Phone size={17} className="text-primary" />}
            </div>
            <div>
              <p className="text-xs text-text-muted">Verification code sent to</p>
              <p className="text-sm font-semibold tracking-wide">{maskedId}</p>
            </div>
          </div>

          {done ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={36} className="text-accent-green" />
              </div>
              <p className="font-bold text-xl mb-1">Verified!</p>
              <p className="text-sm text-text-muted">Creating your account…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2.5 bg-accent-red/10 border border-accent-red/25 text-accent-red px-4 py-3 rounded-xl mb-5 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <p className="text-sm text-text-secondary text-center mb-5">
                Enter the 6-digit code from your {channel === 'email' ? 'inbox' : 'messages'}
              </p>

              {/* OTP input boxes */}
              <div className="flex gap-2.5 justify-center mb-6" onPaste={paste}>
                {otp.map((d, i) => (
                  <input key={i}
                    ref={el => { inputs.current[i] = el }}
                    type="text" inputMode="numeric" maxLength={1}
                    value={d} disabled={loading || done}
                    onChange={e => input(i, e.target.value)}
                    onKeyDown={e => keydown(i, e)}
                    className={`w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none bg-bg-card2
                      ${error ? 'border-accent-red' : d ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text'}
                      focus:border-primary disabled:opacity-50`}
                  />
                ))}
              </div>

              <button onClick={() => verify()} disabled={loading || otp.some(d => !d)}
                className="btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2 text-[15px]">
                {loading
                  ? <><Loader2 size={18} className="animate-spin" /> Verifying…</>
                  : <><CheckCircle size={18} /> Verify & Create Account</>}
              </button>

              <div className="text-center mt-4">
                {countdown > 0
                  ? <p className="text-xs text-text-muted">
                      Resend code in <span className="text-primary font-semibold">{countdown}s</span>
                    </p>
                  : <button onClick={resend}
                      className="text-sm text-primary hover:underline flex items-center gap-1.5 mx-auto font-medium">
                      <RefreshCw size={13} /> Resend code
                    </button>
                }
              </div>
              <p className="text-xs text-text-muted text-center mt-3">
                Code expires in 5 minutes · Check spam if not received
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
