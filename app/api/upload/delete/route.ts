export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/upload/delete
 *
 * Soft-deletes a post in DB and removes its media from ImageKit.
 * Only the post owner can call this.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-cache'
import { isValidUUID } from '@/lib/security'
import { deleteFromImageKit, extractFileIdFromUrl } from '@/lib/imagekit'
import { invalidateFeed, invalidateProfile } from '@/lib/redis'

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const auth = await getAuthUser(req, supabase)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { post_id } = body as { post_id?: string }

    if (!post_id || !isValidUUID(post_id)) {
      return NextResponse.json({ error: 'Valid post_id required' }, { status: 400 })
    }

    // Verify ownership + get media URLs
    const { data: post } = await supabase
      .from('posts')
      .select('user_id, image_url, video_url, video_thumbnail_url')
      .eq('id', post_id)
      .single()

    if (!post)                     return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.user_id !== auth.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Soft-delete in DB first (fast, user sees it gone immediately)
    await supabase.from('posts').update({ is_deleted: true }).eq('id', post_id)

    // Delete media from ImageKit asynchronously (non-blocking)
    const mediaUrls = [post.image_url, post.video_url, post.video_thumbnail_url].filter(Boolean) as string[]
    Promise.allSettled(
      mediaUrls.map(url => {
        const fileId = extractFileIdFromUrl(url)
        return fileId ? deleteFromImageKit(fileId) : Promise.resolve()
      })
    ).catch(() => {}) // fire-and-forget

    // Invalidate Redis caches
    invalidateFeed(auth.userId)
    invalidateProfile(auth.userId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[upload/delete]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
