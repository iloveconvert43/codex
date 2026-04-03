/**
 * lib/security.ts — Centralized security utilities
 * 
 * Covers: UUID validation, CSRF token, input sanitization,
 * rate limiting, request validation helpers
 */
import { NextRequest } from 'next/server'
import { createHash } from 'crypto'

// ── UUID Validation ──────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUUID(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false
  return UUID_RE.test(id)
}

export function validateUUIDs(...ids: (string | null | undefined)[]): string | null {
  for (const id of ids) {
    if (id && !isValidUUID(id)) return `Invalid ID format: ${String(id).slice(0, 20)}`
  }
  return null
}

// ── Rate Limiter (in-memory, production: use Upstash Redis) ──
interface RateRecord { count: number; reset: number; blocked?: number }
const rateLimitStore = new Map<string, RateRecord>()

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number; blockMs?: number } = { max: 10, windowMs: 60000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const rec = rateLimitStore.get(key)
  
  // Check if currently blocked
  if (rec?.blocked && now < rec.blocked) {
    return { allowed: false, remaining: 0, resetAt: rec.blocked }
  }
  
  if (!rec || now > rec.reset) {
    rateLimitStore.set(key, { count: 1, reset: now + opts.windowMs })
    return { allowed: true, remaining: opts.max - 1, resetAt: now + opts.windowMs }
  }
  
  if (rec.count >= opts.max) {
    // Block for blockMs if configured
    if (opts.blockMs) {
      rec.blocked = now + opts.blockMs
    }
    return { allowed: false, remaining: 0, resetAt: rec.reset }
  }
  
  rec.count++
  return { allowed: true, remaining: opts.max - rec.count, resetAt: rec.reset }
}

// ── Input Sanitization ────────────────────────────────────
/** Strip HTML tags and dangerous characters from user input */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+on\w+\s*=\s*["'][^"']*["'][^>]*>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|form|input|button|link|style)[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/vbscript:/gi, '')
    .trim()
}

/** Sanitize for URL context */
export function sanitizeURL(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    return u.href
  } catch { return null }
}

/** Sanitize tag — only safe chars */
export function sanitizeTag(tag: string): string {
  return tag.toLowerCase()
    .replace(/[^a-z0-9_\u0900-\u097F\u0980-\u09FF\u4E00-\u9FFF]/g, '')
    .slice(0, 30)
}

// ── CSRF Protection ────────────────────────────────────────
/** Check Origin/Referer header matches expected host */
export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer')
  if (!origin) return true // Server-to-server calls OK
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  if (!appUrl) return true // Can't validate without app URL
  
  try {
    const originHost = new URL(origin).hostname
    const appHost = new URL(appUrl).hostname
    const isLocal = ['localhost', '127.0.0.1'].includes(originHost)
    return isLocal || originHost === appHost || originHost.endsWith(`.${appHost}`)
  } catch { return false }
}

// ── Request IP ─────────────────────────────────────────────
export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||      // Cloudflare
    req.headers.get('x-real-ip') ||              // Nginx
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  )
}

// ── Content-Length guard ───────────────────────────────────
/** Reject oversized request bodies */
export function checkContentLength(req: NextRequest, maxBytes = 1048576): boolean {
  const cl = req.headers.get('content-length')
  if (cl && parseInt(cl) > maxBytes) return false
  return true
}

// ── Security Headers (add to responses) ───────────────────
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-eval in dev
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.dev https://www.fast2sms.com https://upload.imagekit.io https://ik.imagekit.io",
    "media-src 'self' blob: https://*.r2.dev https://ik.imagekit.io",
    "frame-ancestors 'none'",
  ].join('; ') }
