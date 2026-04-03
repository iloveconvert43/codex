/**
 * lib/fast2sms.ts — Fast2SMS OTP Service (India)
 * 
 * Fast2SMS DLT Route: fastest delivery, works without DLT template
 * for OTP use case under "Route: q" (Quick SMS)
 */

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || ''
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2'

export interface SMSResult {
  success: boolean
  error?: string
  requestId?: string
}

/**
 * Send OTP via Fast2SMS
 * Uses Quick Transactional route — instant delivery
 */
export async function sendOTP(phone: string, otp: string): Promise<SMSResult> {
  if (!FAST2SMS_API_KEY) {
    console.error('FAST2SMS_API_KEY not set')
    return { success: false, error: 'SMS service not configured' }
  }

  // Normalize phone — remove country code if provided
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '')

  if (cleanPhone.length !== 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  const message = `${otp} is your tryHushly verification code. Valid for 10 minutes. Do not share with anyone.`

  try {
    const params = new URLSearchParams({
      authorization: FAST2SMS_API_KEY,
      route: 'q',           // Quick route — no DLT needed for OTP
      message,
      language: 'english',
      flash: '0',
      numbers: cleanPhone,
    })

    const res = await fetch(`${FAST2SMS_URL}?${params}`, {
      method: 'GET',
      headers: {
        'cache-control': 'no-cache',
      },
    })

    const data = await res.json()

    if (data.return === true) {
      return { success: true, requestId: data.request_id }
    } else {
      console.error('[fast2sms]', data)
      return { success: false, error: data.message?.[0] || 'SMS delivery failed' }
    }
  } catch (err: any) {
    console.error('[fast2sms]', err.message)
    return { success: false, error: 'SMS service unavailable' }
  }
}

/**
 * Validate Indian phone number format
 */
export function validateIndianPhone(phone: string): boolean {
  const clean = phone.replace(/^\+91/, '').replace(/\D/g, '')
  if (clean.length !== 10) return false
  // Indian mobile numbers start with 6-9
  return /^[6-9]\d{9}$/.test(clean)
}

/**
 * Normalize phone to E.164 format: +91XXXXXXXXXX
 */
export function normalizePhone(phone: string): string {
  const clean = phone.replace(/^\+91/, '').replace(/\D/g, '')
  return `+91${clean}`
}
