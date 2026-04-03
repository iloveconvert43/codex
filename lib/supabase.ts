import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Missing Supabase environment variables. Check .env.local')
  }
}

// Use placeholder to prevent SDK from throwing during module init
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co'
const safeKey = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MjYyMDAwMDAsImV4cCI6MTk0MTc3NjAwMH0.placeholder'

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'tryhushly-auth-v1',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false },  // false = faster, no URL parsing on every load
  global: {
    headers: { 'x-app-name': 'tryhushly' } },
  realtime: {
    params: { eventsPerSecond: 10 } } })

if (typeof window !== 'undefined') {
  supabase.auth.getSession().catch(() => {})
}
