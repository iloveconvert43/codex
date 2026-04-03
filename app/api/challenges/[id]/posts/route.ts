export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const type     = searchParams.get('type') || 'admin'
    const view     = searchParams.get('view') || 'recent'  // 'recent' | 'top' | 'leaderboard'
    const featured = searchParams.get('featured') !== 'false'  // default: only last 12h

    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let userId: string | null = null
    if (sessionUser) {
      const { data: p } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      userId = p?.id ?? null
    }

    // Leaderboard view — uses SQL function
    if (view === 'leaderboard') {
      const { data: lb } = await supabase.rpc('get_challenge_leaderboard', {
        p_challenge_id: params.id,
        p_type:         type,
        p_limit:        5
      })
      return NextResponse.json({ data: lb || [], view: 'leaderboard' })
    }

    let postIds: string[] = []

    if (type === 'user') {
      let q = supabase.from('user_challenge_posts')
        .select('post_id')
        .eq('user_challenge_id', params.id)
      if (featured) q = q.eq('is_featured', true)  // only last 12h
      q = q.order('created_at', { ascending: false }).limit(30)
      const { data: cp } = await q
      postIds = (cp || []).map((r: any) => r.post_id)
    } else {
      let q = supabase.from('challenge_posts')
        .select('post_id')
        .eq('challenge_id', params.id)
      if (featured) q = q.eq('is_featured', true)  // only last 12h
      q = q.order('created_at', { ascending: false }).limit(30)
      const { data: cp } = await q
      postIds = (cp || []).map((r: any) => r.post_id)
    }

    if (!postIds.length) {
      // If no featured posts, fall back to all posts
      if (featured) {
        const fallbackUrl = new URL(req.url)
        fallbackUrl.searchParams.set('featured', 'false')
        const { data: cp } = type === 'user'
          ? await supabase.from('user_challenge_posts').select('post_id').eq('user_challenge_id', params.id).order('created_at', { ascending: false }).limit(30)
          : await supabase.from('challenge_posts').select('post_id').eq('challenge_id', params.id).order('created_at', { ascending: false }).limit(30)
        postIds = (cp || []).map((r: any) => r.post_id)
      }
      if (!postIds.length) return NextResponse.json({ data: [], view })
    }

    const { data: posts } = await supabase
      .from('posts')
      .select('*, user:users(id,username,display_name,avatar_url,is_verified)')
      .in('id', postIds)
      .eq('is_deleted', false)

    if (!posts?.length) return NextResponse.json({ data: [], view })

    // Batch reactions + comments
    const [{ data: allRxn }, { data: allCmt }] = await Promise.all([
      supabase.from('reactions').select('post_id, type').in('post_id', postIds),
      supabase.from('comments').select('post_id').eq('is_deleted', false).in('post_id', postIds),
    ])

    let userRxnMap: Record<string, string> = {}
    if (userId) {
      const { data: myRxn } = await supabase
        .from('reactions').select('post_id, type').in('post_id', postIds).eq('user_id', userId)
      userRxnMap = Object.fromEntries((myRxn || []).map((r: any) => [r.post_id, r.type]))
    }

    const rxnMap: Record<string, Record<string, number>> = {}
    for (const r of (allRxn || [])) {
      if (!rxnMap[r.post_id]) rxnMap[r.post_id] = { interesting: 0, funny: 0, deep: 0, curious: 0 }
      rxnMap[r.post_id][r.type] = (rxnMap[r.post_id][r.type] || 0) + 1
    }
    const cmtMap: Record<string, number> = {}
    for (const c of (allCmt || [])) cmtMap[c.post_id] = (cmtMap[c.post_id] || 0) + 1

    let enriched = posts.map((p: any) => ({
      ...p,
      reaction_counts: rxnMap[p.id] || { interesting: 0, funny: 0, deep: 0, curious: 0 },
      comment_count:   cmtMap[p.id] || 0,
      user_reaction:   userRxnMap[p.id] ?? null,
    }))

    // Sort by engagement for 'top' view
    if (view === 'top') {
      enriched.sort((a: any, b: any) => {
        const sa = Object.values(a.reaction_counts as Record<string, number>).reduce((x: number, n: number) => x + n, 0) * 3 + a.comment_count * 5
        const sb = Object.values(b.reaction_counts as Record<string, number>).reduce((x: number, n: number) => x + n, 0) * 3 + b.comment_count * 5
        return sb - sa
      })
    }

    return NextResponse.json({ data: enriched, view })
  } catch (err: any) {
    console.error('[challenge/posts]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
