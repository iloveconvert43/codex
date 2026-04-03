export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/challenges/participate (legacy - use /api/challenges/[id]/participate)
 * Kept for backward compatibility
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { awardPoints } from '@/lib/points'

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { challenge_id, post_id } = await req.json()
    if (!challenge_id || !post_id) {
      return NextResponse.json({ error: 'challenge_id and post_id required' }, { status: 400 })
    }

    // Verify post belongs to this user (security: prevent linking others' posts)
    const { data: postCheck } = await supabase
      .from('posts').select('user_id').eq('id', post_id).single()
    if (!postCheck || postCheck.user_id !== profile.id) {
      return NextResponse.json({ error: 'Post not found or not yours' }, { status: 403 })
    }

    const { error } = await supabase.from('challenge_posts').upsert(
      { user_id: profile.id, challenge_id, post_id, is_featured: true },
      { onConflict: 'user_id,challenge_id', ignoreDuplicates: true }
    )
    if (error) throw error

    // Award points (same as [id]/participate)
    awardPoints(profile.id, 'daily_challenge', post_id).then(() => {}).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[participate legacy]', err.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
