export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/auth/otp/send
 * 
 * Step 1 of phone login:
 * - Validate phone number
 * - Generate 6-digit OTP
 * - Store hashed OTP in DB (expires 10 min)
 * - Send via Fast2SMS
 * 
 * Rate limited: 3 OTPs per phone per hour
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendOTP, validateIndianPhone, normalizePhone } from '@/lib/fast2sms'
import { createHash, randomInt } from 'crypto'

// In-memory rate limiter (use Redis in production)
const otpRateLimit = new Map<string, { count: number; reset: number }>()

function checkOTPLimit(phone: string): boolean {
  const now = Date.now()
  const record = otpRateLimit.get(phone)
  if (!record || now > record.reset) {
    otpRateLimit.set(phone, { count: 1, reset: now + 3600000 })
    return true
  }
  if (record.count >= 3) return false
  record.count++
  return true
}

function generateOTP(): string {
  return String(randomInt(100000, 999999))
}

function hashOTP(otp: string, phone: string): string {
  return createHash('sha256').update(`${otp}:${phone}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
    }

    if (!validateIndianPhone(phone)) {
      return NextResponse.json({
        error: 'Enter a valid 10-digit Indian mobile number'
      }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)

    // Rate limit check
    if (!checkOTPLimit(normalizedPhone)) {
      return NextResponse.json({
        error: 'Too many OTP requests. Please wait 1 hour.'
      }, { status: 429 })
    }

    // Generate OTP
    const otp = generateOTP()
    const otpHash = hashOTP(otp, normalizedPhone)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes

    // Store hashed OTP in DB
    const supabase = createAdminClient()
    const { error: dbError } = await supabase
      .from('otp_verifications')
      .upsert({
        phone: normalizedPhone,
        otp_hash: otpHash,
        expires_at: expiresAt,
        verified: false,
        attempts: 0,
      }, { onConflict: 'phone' })

    if (dbError) {
      console.error('[otp/send] DB error:', dbError.message)
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
    }

    // Send SMS via Fast2SMS
    const smsResult = await sendOTP(normalizedPhone, otp)

    if (!smsResult.success) {
      return NextResponse.json({
        error: smsResult.error || 'Failed to send OTP. Try again.'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${normalizedPhone.slice(0, 6)}****${normalizedPhone.slice(-2)}`,
      // In dev mode, return OTP for testing
      ...(process.env.NODE_ENV === 'development' ? { dev_otp: otp } : {}),
    })

  } catch (err: any) {
    console.error('[otp/send]', err.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
