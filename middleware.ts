import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(key)
  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (record.count >= max) return false
  record.count++
  return true
}

let cleanupCounter = 0
function maybeCleanup() {
  if (++cleanupCounter < 100) return
  cleanupCounter = 0
  const now = Date.now()
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetAt) rateLimitStore.delete(key)
  }
}

const PROTECTED_PATHS = [
  '/create', '/messages', '/profile/edit', '/settings',
  '/notifications', '/challenge', '/nearby', '/leaderboard',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  // Rate limiting
  if (pathname.startsWith('/api/')) {
    maybeCleanup()
    if (!checkRateLimit(`api:${ip}`, 200, 60000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    if (pathname.startsWith('/api/auth/')) {
      if (!checkRateLimit(`auth:${ip}`, 20, 60000)) {
        return NextResponse.json(
          { error: 'Too many login attempts. Please wait a minute.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      }
    }
  }

  let res = NextResponse.next({ request: req })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            try { return req.cookies.getAll() } catch { return [] }
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
              res = NextResponse.next({ request: req })
              cookiesToSet.forEach(({ name, value, options }) =>
                res.cookies.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p))

    if (!session && isProtected) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (session && (pathname === '/login' || pathname === '/signup')) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  } catch {
    // Any error — let request through, never block navigation
  }

  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-).*)',
  ],
}
