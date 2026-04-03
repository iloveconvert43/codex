/**
 * lib/env.ts — Runtime environment validation
 */

export function validateEnv() {
  // Only validate at runtime, not during build
  if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    const missing = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
      'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(k => !process.env[k])
    
    if (missing.length > 0) {
      console.warn('Missing env vars:', missing.join(', '))
    }
  }
}
