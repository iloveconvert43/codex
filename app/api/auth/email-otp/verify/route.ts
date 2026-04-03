export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * @deprecated Use /api/auth/register/verify-otp instead.
 * Kept for backward compatibility.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyOTP } from '@/lib/otp'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const identifier = (body.email || body.identifier || '').toLowerCase().trim()
    const otp = String(body.otp || '').replace(/\D/g, '')
    const purpose = body.purpose || 'signup'

    if (!identifier || !otp) {
      return NextResponse.json({ error: 'Email/phone and OTP required' }, { status: 400 })
    }

    const result = await verifyOTP(identifier, otp, purpose)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // For signup with formData — create user account
    if (purpose === 'signup' && body.formData) {
      const supabase = createAdminClient()
      const { full_name, password, phone, gender, dob, nationality, username } = body.formData

      if (!full_name?.trim() || !password || password.length < 8) {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
      }

      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: identifier,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim(), username: username?.toLowerCase() || null } })

      if (authErr) {
        if (authErr.message.includes('already registered')) {
          return NextResponse.json({ error: 'Email already registered. Please log in.', code: 'ALREADY_EXISTS' }, { status: 409 })
        }
        return NextResponse.json({ error: 'Account creation failed.' }, { status: 500 })
      }

      await supabase.from('users').insert({
        auth_id: authData.user.id,
        full_name: full_name.trim(),
        display_name: full_name.trim().split(' ')[0],
        username: username?.toLowerCase() || null,
        email: identifier,
        phone: phone || null,
        gender: gender || null,
        dob: dob || null,
        nationality: nationality || null,
        email_verified: true,
        is_anonymous: false,
        privacy_settings: {
          show_gender: 'public', show_dob: 'private',
          show_phone: 'private', show_nationality: 'public', show_address: 'private' } }).catch(async () => {
        // Rollback auth user if profile fails
        await supabase.auth.admin.deleteUser(authData.user.id).then(() => {}).catch(() => {})
      })

      return NextResponse.json({ success: true, isNewUser: true })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[email-otp/verify]', err.message)
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 })
  }
}
