export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/auth/login
 * 
 * Security features:
 * - Login with email OR phone + password
 * - Rate limit: 10 attempts / IP / 15 min
 * - Account lock: 5 consecutive wrong passwords → locked 30 min
 * - All attempts logged to login_attempts table
 * - Timing-safe comparison (Supabase handles bcrypt)
 * - No email enumeration (generic error messages)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { validateEmail, validatePhone, normalizePhone } from '@/lib/otp'

// IP-based rate limiter
const ipRL = new Map<string, { count: number; reset: number }>()
function checkIPLimit(ip: string): boolean {
  const now = Date.now()
  const r = ipRL.get(ip)
  if (!r || now > r.reset) { ipRL.set(ip, { count: 1, reset: now + 900000 }); return true } // 15 min
  if (r.count >= 10) return false
  r.count++; return true
}

const MAX_FAILED_ATTEMPTS = 5       // lock after 5 wrong passwords
const LOCK_DURATION_MS = 30 * 60000 // 30 minutes

async function logAttempt(
  admin: any,
  identifier: string,
  ip: string,
  userAgent: string,
  success: boolean,
  reason?: string
) {
  try {
    await admin.from('login_attempts').insert({
      identifier: identifier.toLowerCase(),
      ip_address: ip,
      user_agent: userAgent?.slice(0, 200) || null,
      success,
      failure_reason: reason || null })
  } catch {} // non-blocking
}

async function getRecentFailures(admin: any, identifier: string): Promise<number> {
  try {
    const since = new Date(Date.now() - LOCK_DURATION_MS).toISOString()
    const { count } = await admin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', identifier.toLowerCase())
      .eq('success', false)
      .gte('attempted_at', since)
    return count || 0
  } catch { return 0 }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const userAgent = req.headers.get('user-agent') || ''
  const admin = createAdminClient()

  try {
    // ── IP Rate limit ───────────────────────────────────────
    if (!checkIPLimit(ip)) {
      return NextResponse.json({
        error: 'Too many login attempts from your network. Please wait 15 minutes.',
        code: 'IP_RATE_LIMITED'
      }, { status: 429 })
    }

    let body: any
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

    const identifier = body?.identifier
    const password = body?.password

    if (!identifier?.trim()) {
      return NextResponse.json({ error: 'Email or phone number is required' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const trimmedId = identifier.trim()
    const isEmail = validateEmail(trimmedId)
    const isPhone = !isEmail && validatePhone(trimmedId)

    if (!isEmail && !isPhone) {
      return NextResponse.json({
        error: 'Enter a valid email address or mobile number.'
      }, { status: 400 })
    }

    const normalizedId = isPhone ? normalizePhone(trimmedId) : trimmedId.toLowerCase()

    // ── Check account lock ──────────────────────────────────
    const recentFails = await getRecentFailures(admin, normalizedId)
    if (recentFails >= MAX_FAILED_ATTEMPTS) {
      await logAttempt(admin, normalizedId, ip, userAgent, false, 'account_locked')
      return NextResponse.json({
        error: `Account temporarily locked due to too many failed attempts. Please try again in 30 minutes, or reset your password.`,
        code: 'ACCOUNT_LOCKED'
      }, { status: 403 })
    }

    // ── Resolve login email ─────────────────────────────────
    let loginEmail: string

    if (isEmail) {
      loginEmail = normalizedId
    } else {
      // Phone login: look up associated email
      const { data: userProfile } = await admin
        .from('users')
        .select('auth_id')
        .eq('phone', normalizedId)
        .maybeSingle()

      if (!userProfile) {
        // Generic error — don't reveal if phone is registered
        await logAttempt(admin, normalizedId, ip, userAgent, false, 'user_not_found')
        return NextResponse.json({
          error: 'Incorrect phone number or password.',
          code: 'INVALID_CREDENTIALS'
        }, { status: 401 })
      }

      const { data: authUser } = await admin.auth.admin.getUserById(userProfile.auth_id)
      if (!authUser?.user?.email) {
        await logAttempt(admin, normalizedId, ip, userAgent, false, 'no_email_for_phone')
        return NextResponse.json({ error: 'Login failed. Please contact support.' }, { status: 500 })
      }
      loginEmail = authUser.user.email
    }

    // ── Authenticate with Supabase (bcrypt check) ───────────
    // Use createServerClient directly with response cookie support
    const { createServerClient } = await import('@supabase/ssr')
    const cookiesList: Array<{ name: string; value: string; options: any }> = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return [] },
          setAll(cookies) { cookiesList.push(...cookies) },
        },
      }
    )
    const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })

    if (signInErr) {
      const reason = signInErr.message.includes('Invalid login credentials')
        ? 'wrong_password'
        : signInErr.message

      await logAttempt(admin, normalizedId, ip, userAgent, false, reason)

      const failsAfter = recentFails + 1
      const remaining = MAX_FAILED_ATTEMPTS - failsAfter

      if (remaining <= 0) {
        return NextResponse.json({
          error: 'Account locked. Too many failed attempts. Please reset your password or try again in 30 minutes.',
          code: 'ACCOUNT_LOCKED'
        }, { status: 403 })
      }

      if (signInErr.message.includes('Email not confirmed')) {
        return NextResponse.json({
          error: 'Please verify your email before logging in.',
          code: 'EMAIL_NOT_VERIFIED'
        }, { status: 401 })
      }

      return NextResponse.json({
        error: 'Incorrect credentials. Please check your email/phone and password.',
        attemptsRemaining: remaining,
        code: 'INVALID_CREDENTIALS'
      }, { status: 401 })
    }

    // ── Login successful ────────────────────────────────────
    await logAttempt(admin, normalizedId, ip, userAgent, true)

    // Update last_login_at
    if (authData.user) {
      admin.from('users').update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip }).eq('auth_id', authData.user.id).then(() => {}).catch(() => {})
    }

    // Return tokens so client can set session in localStorage via setSession()
    // Build response with cookies set
    const finalResponse = NextResponse.json({
      success: true,
      access_token: authData.session?.access_token,
      refresh_token: authData.session?.refresh_token,
      user: { id: authData.user?.id, email: authData.user?.email }
    })

    // Set auth cookies on the response so middleware can read session
    cookiesList.forEach(({ name, value, options }) => {
      finalResponse.cookies.set(name, value, options)
    })

    return finalResponse

  } catch (err: any) {
    console.error('[auth/login]', err.message)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
