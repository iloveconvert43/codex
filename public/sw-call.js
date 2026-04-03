/**
 * sw-call.js — Custom Service Worker extension for call notifications
 * Imported by the auto-generated PWA service worker via next.config.js
 *
 * Handles:
 *   1. Push notifications while app is closed/background
 *   2. Incoming call notifications with Accept/Decline actions
 *   3. Regular notifications (messages, likes, etc.)
 *   4. Notification click routing
 */

// Listen for push events (app closed or background)
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'New notification', body: event.data.text(), url: '/' }
  }

  const isCall = payload.data?.type === 'incoming_call'

  const options = {
    body:    payload.body,
    icon:    payload.icon  || '/icons/icon-192x192.png',
    badge:   payload.badge || '/icons/icon-96x96.png',
    tag:     payload.tag   || (isCall ? 'incoming-call' : 'notification'),
    data:    payload.data  || { url: payload.url || '/' },
    // Keep call notification persistent (requires interaction)
    requireInteraction: isCall,
    vibrate: isCall ? [300, 100, 300, 100, 300] : [200, 100, 200],
    // Call notifications get Accept + Decline actions
    actions: isCall ? [
      { action: 'accept',  title: '✅ Accept', icon: '/icons/icon-96x96.png' },
      { action: 'decline', title: '❌ Decline', icon: '/icons/icon-96x96.png' },
    ] : [],
    silent: false,
    // Renotify even if same tag (for call ringing)
    renotify: isCall,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

// Handle notification clicks and action buttons
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data      = event.notification.data || {}
  const callerId  = data.caller_id
  const callType  = data.call_type || 'audio'
  const action    = event.action

  let targetUrl = data.url || '/'

  if (data.type === 'incoming_call') {
    if (action === 'decline') {
      // Signal decline via BroadcastChannel (picked up by any open tab)
      const bc = new BroadcastChannel('call-signals')
      bc.postMessage({ type: 'decline', callerId })
      bc.close()
      // Also POST to server so caller sees "declined"
      fetch('/api/calls/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller_id: callerId })
      }).catch(() => {})
      return  // Don't open any tab
    } else {
      // Accept: open messages page with call ready to answer
      targetUrl = `/messages?user=${callerId}&action=answer&type=${callType}`
    }
  }

  // Open or focus the target URL
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'navigate', url: targetUrl })
          return client.focus()
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})

// Handle notification close (user swiped away a call)
self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {}
  if (data.type === 'incoming_call') {
    // Auto-decline if notification swiped away
    const bc = new BroadcastChannel('call-signals')
    bc.postMessage({ type: 'decline', callerId: data.caller_id })
    bc.close()
  }
})
