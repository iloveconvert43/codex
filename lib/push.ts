/**
 * lib/push.ts — Web Push Notification Delivery
 *
 * Uses VAPID keys. Sends push to all user's subscriptions.
 * Schema: push_subscriptions has endpoint, p256dh, auth columns
 */
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase-server'

if (process.env.VAPID_EMAIL && process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  icon?: string
  badge?: string
  tag?:  string        // deduplication key — same tag replaces previous notification
  data?: Record<string, any>
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY) return

  try {
    const supabase = createAdminClient()
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!subscriptions?.length) return

    const notification = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      url:   payload.url || '/',
      icon:  payload.icon  || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/icon-96x96.png',
      tag:   payload.tag   || undefined,
      data:  payload.data  || {}
    })

    const results = await Promise.allSettled(
      subscriptions.map(sub => {
        // Reconstruct PushSubscription object from stored columns
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }
        return webpush.sendNotification(pushSub as any, notification)
      })
    )

    // Remove expired subscriptions (410 Gone)
    const expiredIds = results
      .map((r, i) => ({ r, id: subscriptions[i].id }))
      .filter(({ r }) => r.status === 'rejected' && (r.reason as any)?.statusCode === 410)
      .map(({ id }) => id)

    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds).catch(() => {})
    }
  } catch (err: any) {
    console.error('[sendPush]', err.message)
  }
}

/** Queue push + attempt immediate delivery */
export async function queuePush(userId: string, payload: PushPayload): Promise<void> {
  // Immediate delivery (non-blocking)
  sendPushToUser(userId, payload).catch(() => {})
  // Queue for retry if immediate fails
  try {
    const supabase = createAdminClient()
    await supabase.from('push_queue').insert({
      user_id: userId,
      title:   payload.title,
      body:    payload.body,
      url:     payload.url || '/',
      data:    payload.data || {}
    })
  } catch {}
}
