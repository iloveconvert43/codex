'use client'

export const dynamic = 'force-dynamic'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import BrandLogo from '@/components/ui/BrandLogo'
import toast from 'react-hot-toast'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function strength(pw: string) {
    let s = 0
    if (pw.length >= 8) s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (strength(password) < 2) { setError('Password is too weak'); return }

    setLoading(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) {
        setError(updateErr.message)
        return
      }
      setDone(true)
      toast.success('Password updated!')
      setTimeout(() => router.push('/'), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to reset password')
    } finally { setLoading(false) }
  }

  const pw = strength(password)
  const barColors = ['bg-border','bg-accent-red','bg-orange-500','bg-accent-yellow','bg-blue-400','bg-accent-green']
  const barLabels = ['','Too weak','Weak','Fair','Good','Strong']

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/"><BrandLogo size="lg" className="justify-center" /></Link>
          <p className="text-text-secondary mt-2 text-sm">Set your new password</p>
        </div>

        <div className="glass-card p-7">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-accent-green mx-auto mb-3" />
              <h3 className="font-bold text-lg mb-1">Password Updated!</h3>
              <p className="text-sm text-text-secondary">Redirecting you to the app…</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-5">New Password</h2>

              {error && (
                <div className="flex items-center gap-2 bg-accent-red/10 border border-accent-red/25 text-accent-red px-3 py-2.5 rounded-xl mb-4 text-sm">
                  <AlertCircle size={14} /><span>{error}</span>
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type={showPw ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                      className="input-base pl-10 pr-10 text-sm" />
                    <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1.5">
                      <div className="flex gap-1 mb-0.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`flex-1 h-1 rounded-full ${i <= pw ? barColors[pw] : 'bg-border'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-text-muted">{barLabels[pw]}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type={showPw ? 'text' : 'password'} value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat new password"
                      autoComplete="new-password"
                      className={`input-base pl-10 text-sm ${confirm && password !== confirm ? 'border-accent-red' : ''}`} />
                  </div>
                  {confirm && password === confirm && (
                    <p className="text-xs text-accent-green mt-1 flex items-center gap-1">
                      <CheckCircle size={11} /> Passwords match
                    </p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Updating…' : 'Set New Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>}>
      <ResetForm />
    </Suspense>
  )
}
