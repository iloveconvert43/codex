export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Rank by quality engagement score, not just post count
    // Quality = reactions + comments*2 + reveals*3 on their posts this week
    const { data: posts } = await supabase
      .from('posts')
      .select('user_id, id')
      .eq('is_deleted', false)
      .eq('is_anonymous', false)
      .gte('created_at', since)

    if (!posts?.length) return NextResponse.json({ data: [] })

    const postIds = posts.map((p: any) => p.id)
    const userPostMap: Record<string, string[]> = {}
    for (const p of posts) {
      if (!userPostMap[p.user_id]) userPostMap[p.user_id] = []
      userPostMap[p.user_id].push(p.id)
    }

    // Get engagement data
    const [{ data: reactions }, { data: comments }, { data: reveals }] = await Promise.all([
      supabase.from('reactions').select('post_id').in('post_id', postIds),
      supabase.from('comments').select('post_id').eq('is_deleted', false).in('post_id', postIds),
      supabase.from('mystery_reveals').select('post_id').in('post_id', postIds),
    ])

    const rxnMap: Record<string, number> = {}
    for (const r of reactions || []) rxnMap[r.post_id] = (rxnMap[r.post_id] || 0) + 1
    const cmtMap: Record<string, number> = {}
    for (const c of comments || []) cmtMap[c.post_id] = (cmtMap[c.post_id] || 0) + 1
    const revMap: Record<string, number> = {}
    for (const r of reveals || []) revMap[r.post_id] = (revMap[r.post_id] || 0) + 1

    // Score each user
    const scores: Record<string, number> = {}
    for (const [uid, pids] of Object.entries(userPostMap)) {
      scores[uid] = pids.reduce((sum, pid) => {
        return sum + (rxnMap[pid] || 0) + (cmtMap[pid] || 0) * 2 + (revMap[pid] || 0) * 3
      }, 0) + pids.length * 2  // base score per post
    }

    const topUserIds = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, score]) => ({ id, score: Math.round(score), post_count: userPostMap[id].length }))

    if (!topUserIds.length) return NextResponse.json({ data: [] })

    const { data: users } = await supabase
      .from('users').select('id,username,display_name,avatar_url,is_verified,city')
      .in('id', topUserIds.map(u => u.id))

    const enriched = topUserIds.map(({ id, score, post_count }) => ({
      ...((users || []).find((u: any) => u.id === id) || {}),
      score, post_count
    }))

    return NextResponse.json({ data: enriched })
  } catch (err: any) {
    console.error('[trending/contributors]', err.message)
    return NextResponse.json({ data: [] })
  }
}
