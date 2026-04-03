export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/search?q=<query>&type=<all|posts|people|rooms>&limit=<n>
 * 
 * Unified search across posts, users, and rooms.
 * Results ranked by relevance score.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sanitizeInput } from '@/lib/security'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let q = sanitizeInput(searchParams.get('q') || '').trim().slice(0, 100)
    const type = searchParams.get('type') || 'all'  // all | posts | people | rooms
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    if (!q || q.length < 2) {
      return NextResponse.json({ data: { posts: [], people: [], rooms: [] } })
    }

    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let userId: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      userId = me?.id ?? null
    }

    // Strip leading # for hashtag search
    const cleanQ = q.startsWith('#') ? q.slice(1) : q

    // If user searched a hashtag → weak interest signal
    if (userId && q.startsWith('#')) {
      supabase.rpc('update_user_affinity', {
        p_user_id: userId, p_dimension: `tag:${cleanQ}`, p_delta: 0.5
      }).then(() => {}).catch(() => {})
    }
    const ilike = `%${cleanQ}%`

    const results: Record<string, any[]> = { posts: [], people: [], rooms: [] }

    // ── Posts search ─────────────────────────────────────────
    if (type === 'all' || type === 'posts') {
      const { data: posts } = await supabase
        .from('posts')
        .select(`
          id, content, image_url, is_anonymous, is_mystery,
          city, tags, created_at, view_count, reveal_count,
          user:users(id, username, display_name, avatar_url, is_verified)
        `)
        .eq('is_deleted', false)
        .or(`content.ilike.${ilike},tags.cs.{${cleanQ}}`)
        .or('scope.eq.global,scope.is.null')
        .order('created_at', { ascending: false })
        .limit(type === 'all' ? Math.ceil(limit * 0.6) : limit)

      // Rank by relevance
      const ranked = (posts || [])
        .map(p => ({
          ...p,
          _score: (
            (p.content?.toLowerCase().includes(cleanQ.toLowerCase()) ? 10 : 0) +
            (p.tags?.includes(cleanQ.toLowerCase()) ? 15 : 0) +  // exact tag match = higher
            (p.view_count > 100 ? 5 : 0) +
            ((Date.now() - new Date(p.created_at).getTime()) < 86400000 ? 3 : 0)  // fresh
          )
        }))
        .sort((a, b) => b._score - a._score)
        .map(({ _score, ...p }) => p)

      results.posts = ranked
    }

    // ── People search ─────────────────────────────────────────
    if (type === 'all' || type === 'people') {
      const { data: people } = await supabase
        .from('users')
        .select('id, username, display_name, full_name, avatar_url, is_verified, bio, city, is_private')
        .or(`username.ilike.${ilike},display_name.ilike.${ilike},full_name.ilike.${ilike},bio.ilike.${ilike}`)
        .eq('email_verified', true)
        .order('created_at', { ascending: false })
        .limit(type === 'all' ? Math.ceil(limit * 0.3) : limit)

      // Add is_following status if logged in
      if (userId && people?.length) {
        const userIds = people.map(p => p.id)
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .in('following_id', userIds)
        const followingSet = new Set((follows || []).map(f => f.following_id))
        results.people = people.map(p => ({ ...p, is_following: followingSet.has(p.id) }))
      } else {
        // Add is_following status for logged-in users
      if (userId && people?.length) {
        const pIds = people.map((p: any) => p.id)
        const { data: myFollows } = await supabase
          .from('follows').select('following_id').eq('follower_id', userId).in('following_id', pIds)
        const followSet = new Set((myFollows || []).map((f: any) => f.following_id))
        results.people = (people || []).map((p: any) => ({
          ...p,
          is_following: followSet.has(p.id)
        }))
      } else {
        results.people = people || []
      }
      }
    }

    // ── Rooms search ──────────────────────────────────────────
    if (type === 'all' || type === 'rooms') {
      const { data: rooms } = await supabase
        .from('topic_rooms')
        .select('id, name, slug, description, emoji, member_count, post_count, is_private')
        .or(`name.ilike.${ilike},description.ilike.${ilike}`)
        .order('member_count', { ascending: false })
        .limit(type === 'all' ? Math.ceil(limit * 0.2) : limit)

      // Add is_member status if logged in
      if (userId && rooms?.length) {
        const roomIds = rooms.map(r => r.id)
        const { data: memberships } = await supabase
          .from('room_memberships')
          .select('room_id')
          .eq('user_id', userId)
          .in('room_id', roomIds)
        const memberSet = new Set((memberships || []).map(m => m.room_id))
        results.rooms = rooms.map(r => ({ ...r, is_member: memberSet.has(r.id) }))
      } else {
        results.rooms = rooms || []
      }
    }

    return NextResponse.json({
      data: results,
      query: q,
      total: Object.values(results).reduce((sum, arr) => sum + arr.length, 0) })
  } catch (err: any) {
    console.error('[search]', err.message)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
