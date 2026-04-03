/**
 * lib/ssr-fetch.ts
 * Server-side data fetching for initial page load
 * Facebook approach: pre-render with data = zero loading spinner on first visit
 */
import { headers } from 'next/headers'
import { getJSON } from './redis'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Fetch initial feed data server-side (SSR) */
export async function getInitialFeedSSR(): Promise<any[]> {
  try {
    // Check Redis first (instant)
    const cached = await getJSON<any[]>('feed:ssr:global:v1')
    if (cached) return cached

    // Fetch from Supabase directly (server-side, no auth needed for public posts)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id,content,created_at,city,tags,is_anonymous,is_mystery,image_url,video_url,video_thumbnail_url,view_count,reaction_count,comment_count,scope&is_deleted=eq.false&scope=eq.global&order=created_at.desc&limit=10`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 30 }, // ISR: revalidate every 30s
      }
    )

    if (!res.ok) return []
    const data = await res.json()
    
    // Cache in Redis for 30s
    const { setJSON } = await import('./redis')
    await setJSON('feed:ssr:global:v1', data, 30)
    
    return data || []
  } catch {
    return []
  }
}

/** Fetch challenge of the day (SSR) */
export async function getChallengeSSR(): Promise<any | null> {
  try {
    const cached = await getJSON<any>('challenge:today:ssr:v1')
    if (cached) return cached

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_challenges?is_active=eq.true&order=created_at.desc&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 3600 }, // Revalidate hourly
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const challenge = data?.[0] ?? null
    if (challenge) {
      const { setJSON } = await import('./redis')
      await setJSON('challenge:today:ssr:v1', challenge, 3600)
    }
    return challenge
  } catch {
    return null
  }
}
