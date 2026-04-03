'use client'

import { useState, useEffect, useCallback } from 'react'

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if already installed as PWA
    const standaloneMedia = window.matchMedia('(display-mode: standalone)')
    if (standaloneMedia.matches || (window.navigator as any).standalone) {
      setIsInstalled(true)
      return
    }

    // Listen for display mode changes
    const mqlListener = (e: MediaQueryListEvent) => {
      if (e.matches) { setIsInstalled(true); setCanInstall(false) }
    }
    standaloneMedia.addEventListener('change', mqlListener)

    // Check if event was captured before this hook mounted (global cache)
    if ((window as any).__pwaPromptEvent) {
      setDeferredPrompt((window as any).__pwaPromptEvent)
      setCanInstall(true)
    }

    // Listen for custom event dispatched by inline script
    const onPromptReady = () => {
      if ((window as any).__pwaPromptEvent) {
        setDeferredPrompt((window as any).__pwaPromptEvent)
        setCanInstall(true)
      }
    }
    window.addEventListener('pwa-prompt-ready', onPromptReady)

    // Capture install prompt — also store globally so it survives re-mounts
    const handler = (e: Event) => {
      e.preventDefault()
      ;(window as any).__pwaPromptEvent = e
      setDeferredPrompt(e)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setCanInstall(false)
      setDeferredPrompt(null)
      ;(window as any).__pwaPromptEvent = null
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('pwa-prompt-ready', onPromptReady)
      standaloneMedia.removeEventListener('change', mqlListener)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setCanInstall(false)
      return outcome === 'accepted'
    } catch {
      return false
    }
  }, [deferredPrompt])

  // Stable function reference (doesn't cause useEffect re-run)
  const isMobile = useCallback((): boolean => {
    if (typeof navigator === 'undefined') return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  }, [])

  return { canInstall, isInstalled, promptInstall, isMobile }
}
