'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * BackButtonHandler — Fixes Android PWA back button behavior
 *
 * Problem: When installed as PWA on Android, pressing the system back
 * button exits the app instead of navigating back within the app.
 *
 * Solution:
 * 1. On each navigation, push a dummy history entry so the back
 *    button pops that entry instead of closing the app.
 * 2. Listen for `popstate` — when back is pressed, we get this event
 *    and use router.back() to navigate within the app.
 * 3. If we're already at the root (/), show a "press again to exit" toast
 *    instead of exiting immediately (standard Android UX pattern).
 */
export default function BackButtonHandler() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only active in standalone PWA mode (installed on device)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (!isStandalone) return

    // Push a state so the back button has something to pop
    window.history.pushState({ page: pathname }, '', pathname)

    let backPressCount = 0
    let backPressTimer: ReturnType<typeof setTimeout> | null = null

    function handlePopState(e: PopStateEvent) {
      const isRoot = pathname === '/'

      if (isRoot) {
        // At home page — double-back to exit (standard Android pattern)
        backPressCount++
        if (backPressCount === 1) {
          // Show toast: "Press back again to exit"
          const existingToast = document.getElementById('exit-toast')
          if (!existingToast) {
            const toast = document.createElement('div')
            toast.id = 'exit-toast'
            toast.style.cssText = `
              position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
              background: rgba(22,22,30,0.95); color: #F0EFF8;
              padding: 10px 20px; border-radius: 20px; font-size: 14px;
              font-weight: 500; z-index: 9999; border: 1px solid rgba(255,255,255,0.1);
              box-shadow: 0 4px 20px rgba(0,0,0,0.5);
              animation: fadeIn 0.2s ease;
            `
            toast.textContent = 'Press back again to exit'
            document.body.appendChild(toast)
            setTimeout(() => toast.remove(), 2000)
          }

          // Re-push state so the next back press also triggers popstate
          window.history.pushState({ page: pathname }, '', pathname)

          backPressTimer = setTimeout(() => {
            backPressCount = 0
          }, 2000)
        } else {
          // Second press — allow exit
          window.history.go(-2)
        }
      } else {
        // Not at home — go back within app
        router.back()
        // Re-push to keep the buffer
        setTimeout(() => {
          window.history.pushState({ page: pathname }, '', pathname)
        }, 100)
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (backPressTimer) clearTimeout(backPressTimer)
    }
  }, [pathname, router])

  return null
}
