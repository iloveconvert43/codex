/**
 * lib/auth-cache.ts
 * Facebook-style: auth session cached in Redis
 * Zero DB calls after first login
 */
import { getUserIdFromToken } from './jwt'
import { getCachedUserId, setCachedUserId } from './redis'

export interface AuthUser {
  authId: string
  userId: string
}

// Module-level in-memory cache for the duration of the request
// (Vercel functions are stateless, but this helps within one invocation)
const reqCache = new Map<string, AuthUser>()

export async function getAuthUser(
  req: { headers: { get: (k: string) => string | null } },
  supabase: any
): Promise<AuthUser | null> {
  const authId = getUserIdFromToken(req.headers.get('authorization'))
  if (!authId) return null

  // 1. In-request memory cache (instant)
  if (reqCache.has(authId)) return reqCache.get(authId)!

  // 2. Redis cache (5ms)
  const cached = await getCachedUserId(authId)
  if (cached) {
    const user = { authId, userId: cached }
    reqCache.set(authId, user)
    return user
  }

  // 3. DB lookup — only on cache miss (first ever request)
  const { data } = await supabase
    .from('users').select('id').eq('auth_id', authId).single()
  if (!data?.id) return null

  const user = { authId, userId: data.id }
  await setCachedUserId(authId, data.id)  // Cache 24hr in Redis
  reqCache.set(authId, user)
  return user
}

// Call on sign-out to invalidate session
export async function invalidateAuth(authId: string) {
  const { clearCachedUserId } = await import('./redis')
  await clearCachedUserId(authId)
  reqCache.delete(authId)
}
