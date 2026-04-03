/**
 * lib/redis.ts — Upstash Redis (corrected REST API)
 * Upstash REST API: ALL commands use POST
 * Format: POST /command/arg1/arg2
 */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''

// ALL Upstash commands use POST
async function cmd(command: string, ...args: any[]): Promise<any> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const parts = [command, ...args.map(String)]
    const url = `${REDIS_URL}/${parts.map(encodeURIComponent).join('/')}`
    const res = await fetch(url, {
      method: 'POST',  // Upstash: ALL commands are POST
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(1200),  // 1.2s — handles cold starts
    })
    if (!res.ok) return null
    return (await res.json()).result ?? null
  } catch { return null }
}

// Pipeline: multiple commands in ONE HTTP request
async function pipeline(commands: (string | number)[][]): Promise<any[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return commands.map(() => null)
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),  // 1.5s pipeline
    })
    if (!res.ok) return commands.map(() => null)
    const data = await res.json()
    return Array.isArray(data) ? data.map((d: any) => d.result ?? null) : commands.map(() => null)
  } catch { return commands.map(() => null) }
}

// ── Core ops ─────────────────────────────────────────────
export const rGet = (key: string) => cmd('GET', key)
export const rDel = (key: string) => cmd('DEL', key)

export async function rSet(key: string, val: string, ttl: number) {
  return cmd('SET', key, val, 'EX', String(ttl))
}

// ── JSON helpers ─────────────────────────────────────────
export async function getJSON<T>(key: string): Promise<T | null> {
  const v = await rGet(key)
  if (!v) return null
  try { return JSON.parse(v) } catch { return null }
}

export async function setJSON(key: string, data: any, ttl: number) {
  try { await rSet(key, JSON.stringify(data), ttl) } catch {}
}

// ── Auth session (24hr TTL) ──────────────────────────────
export const getCachedUserId = (authId: string) => rGet(`s:${authId}`)
export async function setCachedUserId(authId: string, uid: string) {
  await rSet(`s:${authId}`, uid, 86400)
}
export async function clearCachedUserId(authId: string) {
  await rDel(`s:${authId}`)
}

// ── Social graph (10min TTL) ─────────────────────────────
export async function getCachedFollowing(userId: string): Promise<string[] | null> {
  return getJSON<string[]>(`fg:${userId}`)
}
export async function setCachedFollowing(userId: string, ids: string[]) {
  await setJSON(`fg:${userId}`, ids, 600)
}
export async function getCachedBlocked(userId: string): Promise<string[] | null> {
  return getJSON<string[]>(`blk:${userId}`)
}
export async function setCachedBlocked(userId: string, ids: string[]) {
  await setJSON(`blk:${userId}`, ids, 600)
}
export async function clearSocialGraph(userId: string) {
  await pipeline([['DEL', `fg:${userId}`], ['DEL', `blk:${userId}`]])
}

// ── Feed (30s TTL) ───────────────────────────────────────
export async function getCachedFeed(key: string) {
  return getJSON<any>(key)
}
export async function setCachedFeed(key: string, data: any) {
  await setJSON(key, data, 60)
}
export async function invalidateFeed(userId: string, city?: string) {
  // Key format used in feed route: feed:{filter}:{userId}:{city}:v2
  // Delete both city-specific and empty-city variants to cover all cases
  const c = city || ''
  await pipeline([
    ['DEL', `feed:global:${userId}::v2`],
    ['DEL', `feed:global:${userId}:${c}:v2`],
    ['DEL', `feed:friends:${userId}::v2`],
    ['DEL', `feed:friends:${userId}:${c}:v2`],
    ['DEL', `feed:city:${userId}::v2`],
    ['DEL', `feed:city:${userId}:${c}:v2`],
    ['DEL', `feed:nearby:${userId}::v2`],
  ])
}

// ── Profile (60s TTL) ────────────────────────────────────
export async function getCachedProfile(userId: string, viewerId: string) {
  return getJSON<any>(`prof:${userId}:${viewerId}`)
}
export async function setCachedProfile(userId: string, viewerId: string, data: any) {
  await setJSON(`prof:${userId}:${viewerId}`, data, 60)  // 60s — short enough to not feel stale
}
export async function invalidateProfile(userId: string) {
  const directKeys = [`prof:${userId}:${userId}`, `prof:${userId}:anon`]
  const matched = await cmd('KEYS', `prof:${userId}:*`)
  const allKeys = Array.from(new Set([
    ...directKeys,
    ...(Array.isArray(matched) ? matched.filter((key): key is string => typeof key === 'string') : []),
  ]))
  if (!allKeys.length) return
  await pipeline(allKeys.map(key => ['DEL', key]))
}

// ── Conversations (15s TTL) ──────────────────────────────
export async function getCachedConversations(userId: string) {
  return getJSON<any>(`conv:${userId}`)
}
export async function setCachedConversations(userId: string, data: any) {
  await setJSON(`conv:${userId}`, data, 15)
}
export async function invalidateConversations(userId: string) {
  await rDel(`conv:${userId}`)
}

// ── Rate limiting (sliding window) ───────────────────────
export async function checkRateLimit(
  key: string, max: number, windowSecs: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowKey = `rl:${key}:${Math.floor(Date.now() / (windowSecs * 1000))}`
  const results = await pipeline([
    ['INCR', windowKey],
    ['EXPIRE', windowKey, String(windowSecs)],
  ])
  const count = results[0] ?? 1
  return { allowed: count <= max, remaining: Math.max(0, max - count) }
}

// ── Backward compat ──────────────────────────────────────
export const getCachedJSON  = getJSON
export const setCachedJSON  = setJSON

// ── Stories (30s TTL) ────────────────────────────────────
export async function getCachedStories(userId: string) {
  return getJSON<any>(`stories:${userId}:v1`)
}
export async function setCachedStories(userId: string, data: any) {
  await setJSON(`stories:${userId}:v1`, data, 30)
}
export async function invalidateStories(userId: string) {
  await rDel(`stories:${userId}:v1`)
}

// ── Notifications (30s TTL) ───────────────────────────────
export async function getCachedNotifications(userId: string) {
  return getJSON<any>(`notif:${userId}:v1`)
}
export async function setCachedNotifications(userId: string, data: any) {
  await setJSON(`notif:${userId}:v1`, data, 30)
}
export async function invalidateNotifications(userId: string) {
  await rDel(`notif:${userId}:v1`)
}

// ── Bootstrap (20s TTL) ───────────────────────────────────
export async function getCachedBootstrap(userId: string) {
  return getJSON<any>(`bootstrap:${userId}:v1`)
}
export async function setCachedBootstrap(userId: string, data: any) {
  await setJSON(`bootstrap:${userId}:v1`, data, 20)
}
export async function invalidateBootstrap(userId: string) {
  await rDel(`bootstrap:${userId}:v1`)
}

// ── Challenge (5min TTL per slot) ─────────────────────────
export async function getCachedChallenge(slot: string, date: string) {
  return getJSON<any>(`challenge:${date}:${slot}:v1`)
}
export async function setCachedChallenge(slot: string, date: string, data: any) {
  await setJSON(`challenge:${date}:${slot}:v1`, data, 300)
}

// ── Leaderboard (5min TTL) ────────────────────────────────
export async function getCachedLeaderboard(period: string) {
  return getJSON<any>(`lb:${period}:v1`)
}
export async function setCachedLeaderboard(period: string, data: any) {
  await setJSON(`lb:${period}:v1`, data, 300)
}

// ── Bulk invalidate (on new post, notification etc.) ──────
export async function invalidateUserCaches(userId: string, city?: string) {
  const c = city || ''
  await pipeline([
    // Feed variants
    ['DEL', `feed:global:${userId}::v2`],
    ['DEL', `feed:global:${userId}:${c}:v2`],
    ['DEL', `feed:friends:${userId}::v2`],
    ['DEL', `feed:friends:${userId}:${c}:v2`],
    ['DEL', `feed:city:${userId}::v2`],
    ['DEL', `feed:city:${userId}:${c}:v2`],
    ['DEL', `feed:nearby:${userId}::v2`],
    // Profile variants
    ['DEL', `prof:${userId}:${userId}`],
    ['DEL', `prof:${userId}:anon`],
    // Stories + bootstrap
    ['DEL', `stories:${userId}:v1`],
    ['DEL', `bootstrap:${userId}:v1`],
  ])
}
