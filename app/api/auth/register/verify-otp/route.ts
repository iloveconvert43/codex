export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/auth/register/verify-otp
 * 
 * Step 2 of signup:
 * 1. Verify OTP hash (5 min expiry, 5 attempt limit)
 * 2. Create Supabase auth user (bcrypt handled by Supabase)
 * 3. Create full profile in users table
 * 4. On failure → rollback auth user
 * 
 * Password security: Supabase stores passwords using bcrypt internally.
 * We never handle the raw password after this point.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit, getClientIP } from '@/lib/security'
import {
  verifyOTP, validateEmail, validatePhone, validatePassword,
  normalizePhone
} from '@/lib/otp'

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req)
    const rl = rateLimit(`verify-otp:${ip}`, { max: 10, windowMs: 900000 }) // 10 per 15min
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many verification attempts. Wait 15 minutes.' }, { status: 429 })
    }
    let body: any
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

    const { identifier, otp, formData } = body

    if (!identifier || !otp) {
      return NextResponse.json({ error: 'Identifier and OTP are required' }, { status: 400 })
    }

    // Normalize identifier
    const trimmedId = identifier.trim()
    const isEmail = validateEmail(trimmedId)
    const isPhone = !isEmail && validatePhone(trimmedId)

    if (!isEmail && !isPhone) {
      return NextResponse.json({ error: 'Invalid identifier' }, { status: 400 })
    }

    const normalizedId = isPhone ? normalizePhone(trimmedId) : trimmedId.toLowerCase()

    // ── 1. Verify OTP ───────────────────────────────────────
    const otpResult = await verifyOTP(normalizedId, String(otp), 'signup')
    if (!otpResult.success) {
      return NextResponse.json({ error: otpResult.error }, { status: 400 })
    }

    // ── 2. Validate form data ───────────────────────────────
    if (!formData) {
      return NextResponse.json({ error: 'Registration data missing' }, { status: 400 })
    }

    const { full_name, password, dob, gender, username, nationality, phone: extraPhone } = formData

    if (!full_name?.trim() || full_name.trim().length < 2) {
      return NextResponse.json({ error: 'Full name required' }, { status: 400 })
    }

    const pwCheck = validatePassword(password)
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Final uniqueness check (race condition protection)
    if (username?.trim()) {
      const { data: uExists } = await supabase
        .from('users').select('id').eq('username', username.toLowerCase()).maybeSingle()
      if (uExists) {
        return NextResponse.json({ error: 'Username was just taken. Please choose another.' }, { status: 409 })
      }
    }

    // ── 3. Create Supabase auth user ────────────────────────
    // OTP send step may have already created an unconfirmed user via signUp().
    // We reuse that user instead of creating a duplicate.
    const authEmail = isEmail
      ? normalizedId
      : `${normalizedId.replace('+', '')}@phone.tryhushly.app`

    let authUserId: string
    let weCreatedAuthUser = false

    const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers()
    const existingAuthUser = existingUsers?.find((u: any) => u.email === authEmail)

    if (existingAuthUser) {
      authUserId = existingAuthUser.id
      const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          username: username?.toLowerCase() || null,
          signup_method: isEmail ? 'email' : 'phone' } })
      if (updateErr) {
        console.error('[register/verify-otp] auth.updateUser:', updateErr.message)
        return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 })
      }
    } else {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        phone: isPhone ? normalizedId : undefined,
        phone_confirm: isPhone ? true : undefined,
        user_metadata: {
          full_name: full_name.trim(),
          username: username?.toLowerCase() || null,
          signup_method: isEmail ? 'email' : 'phone' } })
      if (authErr) {
        console.error('[register/verify-otp] auth.createUser:', authErr.message)
        return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 })
      }
      authUserId = authData.user.id
      weCreatedAuthUser = true
    }

    // Check if profile already exists (idempotency for retries)
    const { data: existingProfile } = await supabase
      .from('users').select('id').eq('auth_id', authUserId).maybeSingle()
    if (existingProfile) {
      return NextResponse.json({ success: true, isNewUser: false, message: 'Account created successfully!' })
    }

    const authData = { user: { id: authUserId } }

    // ── 4. Create profile in users table ───────────────────
    const profilePayload: any = {
      auth_id: authData.user.id,
      full_name: full_name.trim(),
      display_name: full_name.trim().split(' ')[0],
      username: username?.trim().toLowerCase() || null,
      email: isEmail ? normalizedId : null,
      phone: isPhone ? normalizedId : (extraPhone || null),
      gender: gender || null,
      dob: dob || null,
      nationality: nationality || null,
      email_verified: isEmail,
      phone_verified: isPhone,
      is_anonymous: false,
      last_login_at: new Date().toISOString(),
      privacy_settings: {
        show_gender: 'public',
        show_dob: 'private',
        show_phone: 'private',
        show_nationality: 'public',
        show_address: 'private' } }

    const { error: profileErr } = await supabase.from('users').insert(profilePayload)

    if (profileErr) {
      console.error('[register/verify-otp] users.insert:', profileErr.message)
      // Rollback: delete auth user so they can retry
      if (weCreatedAuthUser) { try { await supabase.auth.admin.deleteUser(authData.user.id) } catch {} }
      return NextResponse.json({ error: 'Profile creation failed. Please try again.' }, { status: 500 })
    }

    // Non-blocking: award early adopter badge + init points
    const { data: newProfile } = await supabase
      .from('users').select('id').eq('auth_id', authData.user.id).single()
    if (newProfile?.id) {
      supabase.from('user_badges').insert({ user_id: newProfile.id, badge: 'early_adopter' }).then(() => {}).catch(() => {})
      supabase.from('user_points').upsert({
        user_id: newProfile.id, total_points: 0, weekly_points: 0, level: 'curious_newcomer' }, { onConflict: 'user_id' }).then(() => {}).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      isNewUser: true,
      message: 'Account created successfully!'
    })

  } catch (err: any) {
    console.error('[register/verify-otp]', err.message)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
