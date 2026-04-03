export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { updateProfileSchema, validate } from '@/lib/validation/schemas'
import { sanitizeInput } from '@/lib/security'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('users').select('*').eq('auth_id', sessionUser.id).single()
    if (error || !data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    let rawBody: any
    try { rawBody = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const v = validate(updateProfileSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })
    const body = v.data

    const updates: Record<string, any> = {}
    const allowed = [
      'full_name', 'display_name', 'username', 'bio', 'avatar_url', 'cover_url',
      'phone', 'gender', 'dob', 'nationality', 'address', 'city', 'hometown',
      'pronouns', 'relationship_status', 'languages',
      'latitude', 'longitude', 'is_private', 'pinned_detail', 'privacy_settings'
    ]

    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    // Validate username uniqueness
    if (updates.username) {
      const clean = String(updates.username).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
      if (clean.length < 3) return NextResponse.json({ error: 'Username must be 3+ characters' }, { status: 400 })
      const { data: taken } = await supabase
        .from('users').select('id').eq('username', clean).neq('id', profile.id).maybeSingle()
      if (taken) return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      updates.username = clean
    }

    // Validate phone uniqueness
    if (updates.phone) {
      const { data: phoneTaken } = await supabase
        .from('users').select('id').eq('phone', updates.phone).neq('id', profile.id).maybeSingle()
      if (phoneTaken) return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
    }

    // Validate avatar URL
    if (updates.avatar_url) {
      try { new URL(updates.avatar_url) } catch {
        return NextResponse.json({ error: 'Invalid avatar URL' }, { status: 400 })
      }
    }
    if (updates.cover_url) {
      try { new URL(updates.cover_url) } catch {
        return NextResponse.json({ error: 'Invalid cover URL' }, { status: 400 })
      }
    }

    // Validate privacy_settings structure
    if (updates.privacy_settings) {
      const valid = ['public', 'private']
      const keys = ['show_gender', 'show_dob', 'show_phone', 'show_nationality', 'show_address']
      for (const k of keys) {
        if (updates.privacy_settings[k] && !valid.includes(updates.privacy_settings[k])) {
          return NextResponse.json({ error: `Invalid privacy value for ${k}` }, { status: 400 })
        }
      }
    }

    // Sanitize text fields
    if (updates.bio) updates.bio = sanitizeInput(updates.bio)
    if (updates.display_name) updates.display_name = sanitizeInput(updates.display_name)
    if (updates.full_name) updates.full_name = sanitizeInput(updates.full_name)
    if (updates.address) updates.address = sanitizeInput(updates.address)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', profile.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const res = NextResponse.json({ data })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
