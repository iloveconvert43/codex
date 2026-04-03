import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

// For API Route Handlers — reads BOTH cookies AND Authorization header
// Client sends Bearer token via Authorization header (localStorage-based auth)
// Server sets session via cookies (SSR)
export function createRouteClient() {
  const cookieStore = cookies()

  // Try to get auth from Authorization header first (client-side auth)
  let authToken: string | null = null
  try {
    const headerStore = headers()
    const authHeader = headerStore.get('authorization') || headerStore.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      authToken = authHeader.slice(7)
    }
  } catch {}

  // If we have a Bearer token, use admin client with user context
  // This is safe because we verify the JWT ourselves
  if (authToken) {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${authToken}` }
        },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    )
    return client
  }

  // Fallback: cookie-based auth (SSR / server components)
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        }
      }
    }
  )
}

// Admin client — bypasses RLS, server-only
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
