export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/auth/otp/verify
 * 
 * Step 2 of phone login:
 * - Verify OTP hash
 * - Create or find Supabase user for this phone
 * - Create profile row if new user
 * - Return session
 * 
 * Uses Supabase Admin client to create user sessions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { validateIndianPhone, normalizePhone } from '@/lib/fast2sms'
import { createHash } from 'crypto'

const MAX_ATTEMPTS = 5

function hashOTP(otp: string, phone: string): string {
  return createHash('sha256').update(`${otp}:${phone}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 })
    }

    if (!validateIndianPhone(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    const cleanOTP = String(otp).replace(/\D/g, '')
    if (cleanOTP.length !== 6) {
      return NextResponse.json({ error: 'OTP must be 6 digits' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)
    const supabase = createAdminClient()

    // Fetch OTP record
    const { data: record, error: fetchErr } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', normalizedPhone)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({
        error: 'No OTP found. Please request a new one.'
      }, { status: 400 })
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      return NextResponse.json({
        error: 'OTP expired. Please request a new one.'
      }, { status: 400 })
    }

    // Check already verified
    if (record.verified) {
      return NextResponse.json({
        error: 'OTP already used. Please request a new one.'
      }, { status: 400 })
    }

    // Check max attempts
    if (record.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({
        error: 'Too many wrong attempts. Request a new OTP.'
      }, { status: 429 })
    }

    // Verify hash
    const expectedHash = hashOTP(cleanOTP, normalizedPhone)
    if (record.otp_hash !== expectedHash) {
      // Increment attempt counter
      await supabase
        .from('otp_verifications')
        .update({ attempts: record.attempts + 1 })
        .eq('phone', normalizedPhone)

      const remaining = MAX_ATTEMPTS - record.attempts - 1
      return NextResponse.json({
        error: remaining > 0
          ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many wrong attempts. Request a new OTP.'
      }, { status: 400 })
    }

    // ✅ OTP correct — mark as used
    await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('phone', normalizedPhone)

    // Find or create Supabase auth user for this phone
    // We use email trick: phone@tryhushly.phone as unique identifier
    const phoneEmail = `${normalizedPhone.replace('+', '')}@phone.tryhushly.app`
    const phonePassword = hashOTP('login', normalizedPhone).slice(0, 32) // deterministic password

    // Try to find existing user
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === phoneEmail)

    let authUser = existingUser
    if (!existingUser) {
      // Create new auth user
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: phoneEmail,
        password: phonePassword,
        email_confirm: true, // auto-confirm
        user_metadata: {
          phone: normalizedPhone,
          provider: 'phone',
          display_name: null,
        },
      })
      if (createErr) {
        console.error('[otp/verify] createUser:', createErr.message)
        return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })
      }
      authUser = newUser.user
    }

    if (!authUser) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
    }

    // Ensure profile row exists
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id, phone')
      .eq('auth_id', authUser.id)
      .single()

    if (!existingProfile) {
      // New user — create profile
      await supabase.from('users').insert({
        auth_id: authUser.id,
        phone: normalizedPhone,
        display_name: null,
        username: null,
        is_anonymous: false,
      })
    } else if (!existingProfile.phone) {
      // Existing user without phone — update
      await supabase.from('users').update({ phone: normalizedPhone }).eq('auth_id', authUser.id)
    }

    // Create a session for the user
    const { data: sessionData, error: sessionErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: phoneEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback`,
      }
    })

    if (sessionErr || !sessionData) {
      console.error('[otp/verify] generateLink:', sessionErr?.message)
      return NextResponse.json({ error: 'Session creation failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      isNewUser: !existingUser,
      // Return magic link — client will use this to create session
      magicLink: sessionData.properties?.action_link,
    })

  } catch (err: any) {
    console.error('[otp/verify]', err.message)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
