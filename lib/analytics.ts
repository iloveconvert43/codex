/**
 * lib/analytics.ts — Lightweight client-side analytics
 * 
 * Tracks user activity, post engagement, session info.
 * Sends batched events to Supabase analytics table.
 * Designed to plug into PostHog / Mixpanel later.
 */

export type EventType =
  | 'page_view'
  | 'post_view'
  | 'post_react'
  | 'post_comment'
  | 'post_share'
  | 'post_create'
  | 'mystery_reveal'
  | 'search'
  | 'message_send'
  | 'challenge_participate'
  | 'session_start'
  | 'feed_scroll_depth'
  | 'profile_view'

interface AnalyticsEvent {
  event: EventType
  properties?: Record<string, string | number | boolean>
  timestamp: number
}

class Analytics {
  private queue: AnalyticsEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private sessionId: string
  private isEnabled: boolean

  constructor() {
    this.sessionId = this.generateSessionId()
    this.isEnabled = typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'production'
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  track(event: EventType, properties?: Record<string, string | number | boolean>) {
    if (!this.isEnabled) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[Analytics] ${event}`, properties)
      }
      return
    }

    this.queue.push({
      event,
      properties: { ...properties, session_id: this.sessionId },
      timestamp: Date.now() })

    // Batch flush every 5 seconds or when queue hits 10
    if (this.queue.length >= 10) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 5000)
    }
  }

  private async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.queue.length === 0) return

    const events = [...this.queue]
    this.queue = []

    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        // keepalive ensures events are sent even on page unload
        keepalive: true })
    } catch {
      // Silently fail — analytics shouldn't break the app
    }
  }

  // Flush on page unload
  flushSync() {
    if (this.queue.length === 0) return
    const events = [...this.queue]
    this.queue = []
    navigator.sendBeacon?.('/api/analytics/events', JSON.stringify({ events }))
  }
}

// Singleton
export const analytics = new Analytics()

// React hook for easy usage
export function useAnalytics() {
  return { track: analytics.track.bind(analytics) }
}
