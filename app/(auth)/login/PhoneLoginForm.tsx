'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, ArrowLeft, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface PhoneLoginFormProps {
  redirect: string
  onBack: () => void
}

type Step = 'phone' | 'otp'

export default function PhoneLoginForm({ redirect, onBack }: PhoneLoginFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown for resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  function formatPhone(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    return digits
  }

  async function sendOTP(phoneNum: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNum }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send OTP')
        return false
      }

      // Dev mode — auto-fill OTP
      if (data.dev_otp) {
        const digits = String(data.dev_otp).split('')
        setOtp(digits)
        toast.success(`Dev mode: OTP is ${data.dev_otp}`, { duration: 10000 })
      }

      setMaskedPhone(data.message || `OTP sent to +91 ${phoneNum.slice(0, 3)}***${phoneNum.slice(-2)}`)
      setResendCooldown(60)
      return true
    } catch {
      setError('Network error. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    if (phone.length !== 10) { setError('Enter a valid 10-digit number'); return }
    const ok = await sendOTP(phone)
    if (ok) {
      setStep('otp')
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }

  function handleOTPInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newOtp = [...otp]
    newOtp[index] = digit
    setOtp(newOtp)
    setError('')

    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5 && newOtp.every(d => d !== '')) {
      handleVerifyOTP(newOtp.join(''))
    }
  }

  function handleOTPKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const newOtp = [...otp]
        newOtp[index - 1] = ''
        setOtp(newOtp)
        inputRefs.current[index - 1]?.focus()
      }
    }
  }

  function handleOTPPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      const digits = pasted.split('')
      setOtp(digits)
      inputRefs.current[5]?.focus()
      handleVerifyOTP(pasted)
    }
  }

  async function handleVerifyOTP(otpCode?: string) {
    const code = otpCode || otp.join('')
    if (code.length !== 6) { setError('Enter all 6 digits'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: code }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Verification failed')
        // Clear OTP on too many attempts
        if (res.status === 429) {
          setOtp(['', '', '', '', '', ''])
          setStep('phone')
        }
        return
      }

      // Use magic link to create session in browser
      if (data.magicLink) {
        const { error: sessionErr } = await supabase.auth.verifyOtp({
          token_hash: data.magicLink.split('token=')[1]?.split('&')[0] || '',
          type: 'magiclink',
        })

        if (sessionErr) {
          // Fallback: navigate to magic link directly
          window.location.href = data.magicLink
          return
        }
      }

      toast.success(data.isNewUser ? 'Welcome to tryHushly! 🎉' : 'Welcome back! 👋')
      router.push(redirect)
      router.refresh()

    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setOtp(['', '', '', '', '', ''])
    await sendOTP(phone)
    setTimeout(() => inputRefs.current[0]?.focus(), 100)
  }

  return (
    <div className="w-full">
      {step === 'phone' ? (
        <form onSubmit={handleSendOTP} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2">
              Mobile Number
            </label>
            <div className="flex gap-2">
              {/* Country code */}
              <div className="flex items-center gap-2 px-3 py-3 bg-bg-card2 border border-border rounded-xl text-sm text-text-secondary flex-shrink-0">
                🇮🇳 +91
              </div>
              <div className="relative flex-1">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => { setPhone(formatPhone(e.target.value)); setError('') }}
                  placeholder="9876543210"
                  maxLength={10}
                  autoFocus
                  className="input-base pl-9 text-sm tracking-wider w-full"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-accent-red text-sm">
              <AlertCircle size={14} /><span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading || phone.length !== 10}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Sending OTP…' : 'Send OTP'}
          </button>
        </form>

      ) : (
        <div className="space-y-4">
          {/* Back + header */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError('') }}
              className="text-text-muted hover:text-text transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-sm font-semibold">Enter OTP</p>
              <p className="text-xs text-text-muted">{maskedPhone}</p>
            </div>
          </div>

          {/* 6-digit OTP input */}
          <div className="flex gap-2 justify-center" onPaste={handleOTPPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleOTPInput(i, e.target.value)}
                onKeyDown={e => handleOTPKeyDown(i, e)}
                className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all outline-none bg-bg-card2
                  ${digit ? 'border-primary text-primary' : 'border-border text-text'}
                  ${error ? 'border-accent-red' : ''}
                  focus:border-primary`}
              />
            ))}
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 text-accent-red text-sm">
              <AlertCircle size={14} /><span>{error}</span>
            </div>
          )}

          <button
            onClick={() => handleVerifyOTP()}
            disabled={loading || otp.some(d => !d)}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>

          {/* Resend */}
          <div className="text-center">
            {resendCooldown > 0 ? (
              <p className="text-xs text-text-muted">
                Resend in <span className="text-primary font-medium">{resendCooldown}s</span>
              </p>
            ) : (
              <button onClick={handleResend}
                className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto">
                <RefreshCw size={11} /> Resend OTP
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
