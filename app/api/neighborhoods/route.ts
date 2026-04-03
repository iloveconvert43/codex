export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const city = searchParams.get('city')

  let query = supabase.from('neighborhoods').select('*').order('member_count', { ascending: false })
  if (city) query = query.eq('city', city)
  query = query.limit(30)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[neighborhoods]', err.message)
    return (await import('next/server')).NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Admin only: requires ADMIN_SECRET header
  const adminSecret = req.headers.get('x-admin-secret')
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const supabase = createAdminClient()
  const body = await req.json()
  const { name, city, slug, latitude, longitude, radius_km } = body

  if (!name || !city || !slug) {
    return NextResponse.json({ error: 'name, city, slug required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('neighborhoods')
    .insert({ name, city, slug, latitude, longitude, radius_km: radius_km || 2.0 })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
