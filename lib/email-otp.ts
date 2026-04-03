/**
 * lib/email-otp.ts
 * @deprecated Use lib/otp.ts instead
 * Kept for backward compatibility during transition
 */
export { generateOTP, hashOTP, storeOTP as storeOTP_legacy, verifyOTP } from './otp'

// Legacy wrapper
import { createAdminClient } from '@/lib/supabase-server'
import { generateOTP, hashOTP } from './otp'
import { createHash } from 'crypto'

export async function storeOTP(
  email: string,
  otp: string,
  purpose: 'signup' | 'reset_password' = 'signup'
): Promise<void> {
  const supabase = createAdminClient()
  const otpHash = hashOTP(otp, email)
  const expiresAt = new Date(Date.now() + 5 * 60000).toISOString()

  await supabase.from('email_otps').upsert({
    email: email.toLowerCase(),
    otp_hash: otpHash,
    purpose,
    expires_at: expiresAt,
    verified: false,
    attempts: 0 }, { onConflict: 'email,purpose' })
}
