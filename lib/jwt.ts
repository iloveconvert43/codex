/**
 * lib/jwt.ts
 * Extract user_id from JWT without a DB round-trip
 * Supabase JWT contains sub = auth user id
 */

export function getUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    // Verify not expired
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload.sub || null
  } catch {
    return null
  }
}
