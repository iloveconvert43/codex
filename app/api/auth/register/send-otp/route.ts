export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/auth/register/send-otp
 * 
 * Step 1 of signup:
 * 1. Validate all form fields
 * 2. Check email/phone not already registered  
 * 3. Generate OTP
 * 4. Send OTP via email or SMS depending on signup method
 * 5. Store OTP hash in DB (5 min expiry)
 * 
 * Rate limit: 3 OTP requests per email/phone per hour
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  generateOTP, storeOTP, sendEmailOTP, sendSMSOTP,
  validateEmail, validatePhone, validatePassword, normalizePhone,
  maskIdentifier
} from '@/lib/otp'

// Rate limiter: 3 requests/identifier/hour
const rl = new Map<string, { count: number; reset: number }>()
function checkRL(id: string): boolean {
  const now = Date.now()
  const r = rl.get(id)
  if (!r || now > r.reset) { rl.set(id, { count: 1, reset: now + 3600000 }); return true }
  if (r.count >= 3) return false
  r.count++; return true
}

export async function POST(req: NextRequest) {
  try {
    let body: any
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

    const { full_name, identifier, password, dob, gender, username } = body

    // ── 1. Validate required fields ────────────────────────
    if (!full_name?.trim() || full_name.trim().length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters' }, { status: 400 })
    }
    if (!identifier?.trim()) {
      return NextResponse.json({ error: 'Email or phone number is required' }, { status: 400 })
    }
    if (!dob) {
      return NextResponse.json({ error: 'Date of birth is required' }, { status: 400 })
    }

    // Validate age (must be 13+)
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000))
    if (age < 13) {
      return NextResponse.json({ error: 'You must be at least 13 years old to sign up' }, { status: 400 })
    }
    if (age > 120) {
      return NextResponse.json({ error: 'Please enter a valid date of birth' }, { status: 400 })
    }

    // Validate password
    const pwCheck = validatePassword(password)
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 })
    }

    // Validate username if provided
    if (username && !/^[a-z0-9_]{3,30}$/.test(username.toLowerCase())) {
      return NextResponse.json({ error: 'Username: 3–30 chars, letters/numbers/underscore only' }, { status: 400 })
    }

    // ── 2. Determine identifier type ───────────────────────
    const trimmedId = identifier.trim()
    const isEmail = validateEmail(trimmedId)
    const isPhone = !isEmail && validatePhone(trimmedId)

    if (!isEmail && !isPhone) {
      return NextResponse.json({
        error: 'Enter a valid email address or 10-digit Indian mobile number'
      }, { status: 400 })
    }

    const normalizedId = isPhone ? normalizePhone(trimmedId) : trimmedId.toLowerCase()
    const channel = isEmail ? 'email' : 'phone'

    // ── 3. Check not already registered ────────────────────
    const supabase = createAdminClient()

    if (isEmail) {
      // Check Supabase Auth
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const emailExists = authUsers?.users?.some(u => u.email?.toLowerCase() === normalizedId)
      // Also check our users table
      const { data: profileExists } = await supabase
        .from('users').select('id').eq('email', normalizedId).maybeSingle()

      if (emailExists || profileExists) {
        return NextResponse.json({
          error: 'An account with this email already exists. Please log in.',
          code: 'EMAIL_EXISTS'
        }, { status: 409 })
      }
    } else {
      const { data: phoneExists } = await supabase
        .from('users').select('id').eq('phone', normalizedId).maybeSingle()
      if (phoneExists) {
        return NextResponse.json({
          error: 'An account with this phone number already exists. Please log in.',
          code: 'PHONE_EXISTS'
        }, { status: 409 })
      }
    }

    // Check username uniqueness
    if (username) {
      const { data: usernameExists } = await supabase
        .from('users').select('id').eq('username', username.toLowerCase()).maybeSingle()
      if (usernameExists) {
        return NextResponse.json({ error: 'Username already taken. Please choose another.' }, { status: 409 })
      }
    }

    // ── 4. Rate limit ───────────────────────────────────────
    if (!checkRL(normalizedId)) {
      return NextResponse.json({
        error: 'Too many OTP requests. Please wait 1 hour before requesting again.'
      }, { status: 429 })
    }

    // ── 5. Generate & store OTP ─────────────────────────────
    const otp = generateOTP()
    await storeOTP(normalizedId, channel, otp, 'signup')

    // ── 6. Send OTP ─────────────────────────────────────────
    let sendResult: { success: boolean; error?: string }
    if (isEmail) {
      sendResult = await sendEmailOTP(normalizedId, otp)
    } else {
      sendResult = await sendSMSOTP(normalizedId, otp)
    }

    if (!sendResult.success) {
      console.error('[register/send-otp] send failed:', sendResult.error)
      // Don't fail the request — OTP is stored, user might get it via retry
      // But in production this should trigger alert
    }

    return NextResponse.json({
      success: true,
      channel,
      message: `Verification code sent to ${maskIdentifier(normalizedId, channel)}`,
      ...(process.env.NODE_ENV === 'development' ? { dev_otp: otp } : {})
    })

  } catch (err: any) {
    console.error('[register/send-otp]', err.message)
    return NextResponse.json({ error: 'Failed to send verification code. Try again.' }, { status: 500 })
  }
}
