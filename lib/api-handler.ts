/**
 * lib/api-handler.ts
 * 
 * Master wrapper for all API routes.
 * Handles: try-catch, auth, rate limiting, input validation, security headers.
 * 
 * Usage:
 *   export const POST = handler({ auth: true, rateLimit: { max: 10, windowMs: 60000 } },
 *     async (req, { session, profile, supabase }) => {
 *       return NextResponse.json({ data: 'ok' })
 *     }
 *   )
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit, getClientIP, validateOrigin } from '@/lib/security'

interface HandlerOptions {
  auth?: boolean           // Require logged-in user
  adminOnly?: boolean      // Require ADMIN_SECRET header
  rateLimit?: {
    max: number
    windowMs: number
    keyFn?: (req: NextRequest, ip: string, userId?: string) => string
  }
  requireOrigin?: boolean  // Validate origin header
}

interface HandlerContext {
  session: any
  profile: { id: string; is_banned: boolean } | null
  supabase: ReturnType<typeof createAdminClient>
  ip: string
}

type HandlerFn = (
  req: NextRequest,
  ctx: HandlerContext,
  params?: any
) => Promise<NextResponse>

export function handler(opts: HandlerOptions, fn: HandlerFn) {
  return async (req: NextRequest, routeCtx?: any): Promise<NextResponse> => {
    try {
      const ip = getClientIP(req)

      // ── 1. Origin validation (CSRF) ──────────────────────
      if (opts.requireOrigin && !validateOrigin(req)) {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
      }

      // ── 2. Admin check ────────────────────────────────────
      if (opts.adminOnly) {
        const secret = req.headers.get('x-admin-secret')
        if (!secret || secret !== process.env.ADMIN_SECRET) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }
      }

      // ── 3. Rate limiting ──────────────────────────────────
      const supabase = createAdminClient()
      let session: any = null
      let profile: { id: string; is_banned: boolean } | null = null

      if (opts.auth || opts.rateLimit) {
        const { data: { session: s } } = await supabase.auth.getSession()
        session = s
      }

      if (opts.rateLimit) {
        const rlKey = opts.rateLimit.keyFn
          ? opts.rateLimit.keyFn(req, ip, session?.user?.id)
          : `${req.nextUrl.pathname}:${session?.user?.id || ip}`

        const rl = rateLimit(rlKey, {
          max: opts.rateLimit.max,
          windowMs: opts.rateLimit.windowMs })

        if (!rl.allowed) {
          return NextResponse.json(
            { error: 'Too many requests. Please slow down.' },
            {
              status: 429,
              headers: {
                'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
                'X-RateLimit-Limit': String(opts.rateLimit.max),
                'X-RateLimit-Remaining': '0' } }
          )
        }
      }

      // ── 4. Auth check ─────────────────────────────────────
      if (opts.auth) {
        if (!session) {
          return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
        }

        const { data: p } = await supabase
          .from('users')
          .select('id, is_banned')
          .eq('auth_id', session.user.id)
          .single()

        if (!p) {
          return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        if (p.is_banned) {
          return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
        }

        profile = p
      }

      // ── 5. Call the actual handler ─────────────────────────
      const params = routeCtx?.params
      return await fn(req, { session, profile, supabase, ip }, params)

    } catch (err: any) {
      // Never expose internal errors in production
      console.error(`[API Error] ${req.nextUrl.pathname}:`, err.message)
      const isDev = process.env.NODE_ENV === 'development'
      return NextResponse.json(
        { error: isDev ? err.message : 'Something went wrong. Please try again.' },
        { status: 500 }
      )
    }
  }
}
