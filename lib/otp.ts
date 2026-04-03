/**
 * lib/otp.ts — Unified OTP Service
 * 
 * Supports both email OTP and SMS OTP (via Fast2SMS for India).
 * OTPs are stored as SHA-256 hashes — never plain text.
 * 
 * Security:
 *   - 6-digit random OTP
 *   - 5-minute expiry
 *   - 5 max wrong attempts before lockout
 *   - 3 OTP requests per identifier per hour
 *   - Hash: SHA-256(otp + identifier + SERVER_SECRET)
 */

import { createAdminClient } from '@/lib/supabase-server'
import { createHash, randomInt } from 'crypto'

const SERVER_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-change-in-prod'
const OTP_EXPIRY_MINUTES = 5
const MAX_ATTEMPTS = 5

export type OTPPurpose = 'signup' | 'reset_password' | 'verify_phone'
export type OTPChannel = 'email' | 'phone'

/** Generate a secure 6-digit OTP */
export function generateOTP(): string {
  return String(randomInt(100000, 999999)).padStart(6, '0')
}

/** Hash OTP for secure storage */
export function hashOTP(otp: string, identifier: string): string {
  return createHash('sha256')
    .update(`${otp.trim()}:${identifier.toLowerCase()}:${SERVER_SECRET}`)
    .digest('hex')
}

/** Store OTP hash in DB */
export async function storeOTP(
  identifier: string,
  identifierType: OTPChannel,
  otp: string,
  purpose: OTPPurpose = 'signup'
): Promise<void> {
  const supabase = createAdminClient()
  const normalizedId = identifier.toLowerCase().trim()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000).toISOString()

  await supabase.from('otp_verifications').upsert({
    identifier: normalizedId,
    identifier_type: identifierType,
    otp_hash: hashOTP(otp, normalizedId),
    purpose,
    expires_at: expiresAt,
    verified: false,
    attempts: 0 }, { onConflict: 'identifier,purpose' })
}

/** Verify OTP — returns success or detailed error */
export async function verifyOTP(
  identifier: string,
  otp: string,
  purpose: OTPPurpose = 'signup'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  const normalizedId = identifier.toLowerCase().trim()
  const cleanOTP = String(otp).replace(/\D/g, '')

  if (cleanOTP.length !== 6) {
    return { success: false, error: 'OTP must be exactly 6 digits.' }
  }

  const { data: record } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('identifier', normalizedId)
    .eq('purpose', purpose)
    .single()

  if (!record) {
    return { success: false, error: 'No verification code found. Please request a new one.' }
  }

  if (record.verified) {
    return { success: false, error: 'This code has already been used. Please request a new one.' }
  }

  if (new Date(record.expires_at) < new Date()) {
    return { success: false, error: 'Code expired. Please request a new one.' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many wrong attempts. Please request a new code.' }
  }

  const expectedHash = hashOTP(cleanOTP, normalizedId)

  if (record.otp_hash !== expectedHash) {
    // Increment attempt counter
    await supabase
      .from('otp_verifications')
      .update({ attempts: record.attempts + 1 })
      .eq('identifier', normalizedId)
      .eq('purpose', purpose)

    const remaining = MAX_ATTEMPTS - record.attempts - 1
    if (remaining <= 0) {
      return { success: false, error: 'Too many wrong attempts. Please request a new code.' }
    }
    return {
      success: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    }
  }

  // ✅ Correct — mark as used
  await supabase
    .from('otp_verifications')
    .update({ verified: true })
    .eq('identifier', normalizedId)
    .eq('purpose', purpose)

  return { success: true }
}

/** Send OTP via email (Gmail SMTP via nodemailer) */
export async function sendEmailOTP(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpUser || !smtpPass) {
    console.error('[sendEmailOTP] SMTP_USER or SMTP_PASS not set')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const nodemailer = await import('nodemailer')

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    await transporter.sendMail({
      from: `"tryHushly" <${smtpUser}>`,
      to: email.toLowerCase(),
      subject: `${otp} — Your tryHushly verification code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#a855f7;">tryHushly</h2>
          <p>Your verification code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#a855f7;padding:20px;background:#f5f5f5;border-radius:8px;text-align:center;">
            ${otp}
          </div>
          <p style="color:#666;font-size:14px;margin-top:16px;">
            This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.
          </p>
        </div>
      `,
    })

    return { success: true }
  } catch (err: any) {
    console.error('[sendEmailOTP]', err.message)
    return { success: false, error: 'Failed to send email' }
  }
}

/** Send OTP via SMS (Fast2SMS - India) */
export async function sendSMSOTP(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) {
    console.warn('[sendSMSOTP] FAST2SMS_API_KEY not set')
    return { success: false, error: 'SMS service not configured' }
  }

  const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '')
  if (cleanPhone.length !== 10) {
    return { success: false, error: 'Invalid phone number for SMS' }
  }

  try {
    const message = `${otp} is your tryHushly verification code. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do NOT share with anyone.`
    const params = new URLSearchParams({
      authorization: apiKey,
      route: 'q',
      message,
      language: 'english',
      flash: '0',
      numbers: cleanPhone })

    const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params}`, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' } })
    const data = await res.json()

    if (data.return === true) return { success: true }
    return { success: false, error: data.message?.[0] || 'SMS delivery failed' }
  } catch (err: any) {
    console.error('[sendSMSOTP]', err.message)
    return { success: false, error: 'SMS service unavailable' }
  }
}

/** Mask identifier for display (privacy) */
export function maskIdentifier(identifier: string, type: OTPChannel): string {
  if (type === 'email') {
    const [local, domain] = identifier.split('@')
    return local.slice(0, 2) + '*'.repeat(Math.min(local.length - 2, 4)) + '@' + domain
  }
  // Phone
  return identifier.slice(0, 4) + '****' + identifier.slice(-2)
}

/** Validate Indian phone number */
export function validatePhone(phone: string): boolean {
  const clean = phone.replace(/^\+91/, '').replace(/\D/g, '')
  return clean.length === 10 && /^[6-9]\d{9}$/.test(clean)
}

/** Normalize phone to +91 format */
export function normalizePhone(phone: string): string {
  const clean = phone.replace(/^\+91/, '').replace(/\D/g, '')
  return `+91${clean}`
}

/** Validate email format */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/** Password strength validation */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password too long (max 128 characters)' }
  }
  return { valid: true }
}
