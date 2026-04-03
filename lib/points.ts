/**
 * lib/points.ts — Curiosity Points award system
 * 
 * Called server-side only (after DB writes).
 * All awards are non-blocking (fire-and-forget).
 */
import { createAdminClient } from '@/lib/supabase-server'
import { POINTS_CONFIG } from '@/types'

type PointsReason = keyof typeof POINTS_CONFIG

export async function awardPoints(
  userId: string,
  reason: PointsReason,
  refId?: string
): Promise<void> {
  const points = POINTS_CONFIG[reason]
  if (!points || points <= 0) return

  try {
    const supabase = createAdminClient()
    await supabase.rpc('award_points', {
      p_user_id: userId,
      p_points: points,
      p_reason: reason,
      p_ref_id: refId || null })

    // Check for level-up and badge notifications
    const { data: userPoints } = await supabase
      .from('user_points')
      .select('level, total_points')
      .eq('user_id', userId)
      .single()

    if (userPoints) {
      // Award level badges
      const levelBadges: Record<string, string> = {
        story_seeker: 'level_story_seeker',
        mystery_maker: 'level_mystery_maker',
        hushly_legend: 'level_hushly_legend' }
      const badge = levelBadges[userPoints.level]
      if (badge) {
        const { data: existing } = await supabase
          .from('user_badges')
          .select('badge')
          .eq('user_id', userId)
          .eq('badge', badge)
          .single()

        if (!existing) {
          await supabase.from('user_badges')
            .insert({ user_id: userId, badge })
          // Notify user of level-up
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'badge_awarded',
            message: `You reached ${userPoints.level.replace(/_/g, ' ')} level! 🎉` })
        }
      }
    }
  } catch (err: any) {
    console.error('[awardPoints]', err.message)
    // Never throw — points failure must not break user flow
  }
}

export async function getLeaderboard(period: 'weekly' | 'all_time' = 'weekly') {
  const supabase = createAdminClient()
  const col = period === 'weekly' ? 'weekly_points' : 'total_points'
  const { data } = await supabase
    .from('user_points')
    .select(`${col}, level, user:users(id, display_name, username, avatar_url, city)`)
    .order(col, { ascending: false })
    .limit(20)
  return data || []
}
