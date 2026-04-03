export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * @deprecated Use /api/auth/register/send-otp instead.
 * Kept for backward compatibility — directly calls the OTP library.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { generateOTP, storeOTP, sendEmailOTP } from '@/lib/otp'

const rl = new Map<string, { count: number; reset: number }>()
function checkRL(email: string): boolean {
  const now = Date.now()
  const r = rl.get(email)
  if (!r || now > r.reset) { rl.set(email, { count: 1, reset: now + 3600000 }); return true }
  if (r.count >= 3) return false
  r.count++; return true
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email || body.identifier || '').toLowerCase().trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (!checkRL(email)) {
      return NextResponse.json({ error: 'Too many requests. Wait 1 hour.' }, { status: 429 })
    }

    const purpose = body.purpose || 'signup'

    if (purpose === 'signup') {
      const supabase = createAdminClient()
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      if (authUsers?.users?.some((u: any) => u.email === email)) {
        return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409 })
      }
    }

    const otp = generateOTP()
    await storeOTP(email, 'email', otp, purpose)
    await sendEmailOTP(email, otp)

    const masked = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '****' + c)
    return NextResponse.json({
      success: true,
      channel: 'email',
      message: `Verification code sent to ${masked}`,
      ...(process.env.NODE_ENV === 'development' ? { dev_otp: otp } : {}) })
  } catch (err: any) {
    console.error('[email-otp/send]', err.message)
    return NextResponse.json({ error: 'Failed to send verification code.' }, { status: 500 })
  }
}
