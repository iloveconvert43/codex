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
    let userCity: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id, city').eq('auth_id', sessionUser.id).single()
      userId = me?.id ?? null
      userCity = me?.city ?? null
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
          user:users(id, username, display_name, avatar_url, is_verified, city, is_private)
        `)
        .eq('is_deleted', false)
        .or(`content.ilike.${ilike},tags.cs.{${cleanQ}}`)
        .or('scope.eq.global,scope.is.null')
        .order('created_at', { ascending: false })
        .limit(type === 'all' ? Math.ceil(limit * 0.6) : limit)

      const authorIds = Array.from(new Set((posts || []).map((post: any) => post.user?.id).filter(Boolean)))
      let followingSet = new Set<string>()
      if (userId && authorIds.length) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .in('following_id', authorIds)
        followingSet = new Set((follows || []).map((row) => row.following_id))
      }

      // Rank by relevance
      const ranked = (posts || [])
        .filter((post: any) => {
          const author = post.user
          if (!author?.is_private) return true
          if (!userId) return false
          return author.id === userId || followingSet.has(author.id)
        })
        .map(p => ({
          ...p,
          is_following_author: !!(p.user?.id && followingSet.has(p.user.id)),
          _score: (
            (p.content?.toLowerCase().includes(cleanQ.toLowerCase()) ? 10 : 0) +
            (p.tags?.includes(cleanQ.toLowerCase()) ? 15 : 0) +  // exact tag match = higher
            (p.user?.username?.toLowerCase() === cleanQ.toLowerCase() ? 20 : 0) +
            (p.user?.display_name?.toLowerCase() === cleanQ.toLowerCase() ? 15 : 0) +
            (p.user?.id && followingSet.has(p.user.id) ? 18 : 0) +
            (userCity && p.user?.city && userCity === p.user.city ? 6 : 0) +
            (p.image_url ? 2 : 0) +
            (p.is_mystery ? 2 : 0) +
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

      if (userId && people?.length) {
        const personIds = people.map((person) => person.id)
        const [{ data: follows }, { data: followers }] = await Promise.all([
          supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', userId)
            .in('following_id', personIds),
          supabase
            .from('follows')
            .select('follower_id')
            .eq('following_id', userId)
            .in('follower_id', personIds),
        ])

        const followingSet = new Set((follows || []).map((row) => row.following_id))
        const followerSet = new Set((followers || []).map((row) => row.follower_id))

        results.people = (people || [])
          .map((person: any) => {
            const username = String(person.username || '').toLowerCase()
            const displayName = String(person.display_name || person.full_name || '').toLowerCase()
            const query = cleanQ.toLowerCase()
            const isFollowing = followingSet.has(person.id)
            const followsYou = followerSet.has(person.id)
            const score =
              (username === query ? 80 : 0) +
              (displayName === query ? 60 : 0) +
              (username.startsWith(query) ? 30 : 0) +
              (displayName.startsWith(query) ? 25 : 0) +
              (isFollowing ? 25 : 0) +
              (followsYou ? 15 : 0) +
              (userCity && person.city && userCity === person.city ? 8 : 0) +
              (person.is_verified ? 4 : 0)

            return {
              ...person,
              is_following: isFollowing,
              follows_you: followsYou,
              _score: score,
            }
          })
          .sort((a: any, b: any) => b._score - a._score)
          .map(({ _score, ...person }: any) => person)
      } else {
        results.people = people || []
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
