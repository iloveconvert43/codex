'use client'

/**
 * PWAInstallPrompt
 *
 * STRATEGY — "every session, every visit":
 *
 *   1. User opens site in browser (not PWA)
 *   2. After 3s → show install prompt
 *   3. "Later" / X → snooze for 30 minutes only
 *   4. Next session (new tab, refresh after 30min) → show again
 *   5. App installed → mark permanently, never show again
 *
 * This maximises installs — user sees it every visit until they install.
 *
 * Platforms:
 *   Android / Chrome / Desktop → native beforeinstallprompt
 *   iOS Safari                 → manual "Add to Home Screen" guide
 */

import { useState, useEffect, useRef } from 'react'
import { Download, Share, X, MapPin } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'

const INSTALLED_KEY = 'pwa-installed'         // permanent once installed
const SNOOZE_KEY    = 'pwa-snooze-until'      // timestamp — snooze 30 min

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as any).MSStream
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

function isSnoozed(): boolean {
  try {
    const until = parseInt(localStorage.getItem(SNOOZE_KEY) || '0')
    return until > 0 && Date.now() < until
  } catch { return false }
}

function isPermInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false }
}

export default function PWAInstallPrompt() {
  const { canInstall, isInstalled, promptInstall } = usePWA()
  const [step, setStep]       = useState<'hidden' | 'install' | 'ios' | 'location'>('hidden')
  const [installing, setInstalling] = useState(false)
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef            = useRef(false)

  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    // Already running as installed PWA
    if (isStandalone()) {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
      return
    }
    // Permanently installed
    if (isPermInstalled()) return
    // Snoozed within last 30 min
    if (isSnoozed()) return

    const ios = isIOS()

    // Show after 3s — every single visit
    timerRef.current = setTimeout(() => {
      if (ios) {
        setStep('ios')
      } else if (canInstall) {
        setStep('install')
      }
      // Desktop waiting for canInstall: handled in second effect
    }, 3000)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, []) // eslint-disable-line

  // canInstall may fire after mount — catch it
  useEffect(() => {
    if (!canInstall || isIOS()) return
    if (step !== 'hidden') return   // already showing something
    if (isStandalone() || isPermInstalled() || isSnoozed()) return

    timerRef.current = setTimeout(() => setStep('install'), 3000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [canInstall]) // eslint-disable-line

  // Track native install event
  useEffect(() => {
    const handler = () => {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
      // Skip location step - go straight to hidden
      setStep('hidden')
    }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  // Snooze 30 min — re-shows next session or after 30 min
  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 30 * 60 * 1000))
    } catch {}
    setStep('hidden')
  }

  async function handleInstall() {
    setInstalling(true)
    try {
      const accepted = await promptInstall()
      if (accepted) {
        try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
        setStep('hidden')
      } else {
        snooze()
      }
    } finally {
      setInstalling(false)
    }
  }

  function handleAllowLocation() {
    try { localStorage.setItem('location-asked', '1') } catch {}
    setStep('hidden')
    if (!navigator?.geolocation) return
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 12000 })
  }

  if (step === 'hidden') return null

  // ── Location step (after install) ───────────────────────────────
  // ── iOS Safari guide ─────────────────────────────────────────────
  if (step === 'ios') {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-[100] sm:left-auto sm:right-6 sm:w-80 animate-pop-in">
        <div className="glass-card p-4 shadow-card border-primary/30">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-xl flex-shrink-0">
              🤫
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Install tryHushly</p>
              <p className="text-xs text-text-muted">Best experience on home screen</p>
            </div>
            {/* X = snooze 30 min, NOT permanent */}
            <button onClick={snooze} className="text-text-muted hover:text-text flex-shrink-0 p-1">
              <X size={16} />
            </button>
          </div>

          {/* Steps */}
          <div className="bg-bg-card2 rounded-xl p-3 space-y-2.5 mb-3">
            <div className="flex items-center gap-2.5 text-xs text-text-secondary">
              <Share size={14} className="text-primary flex-shrink-0" />
              <span>Tap the <strong className="text-text">Share</strong> button in Safari</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-secondary">
              <span className="text-primary font-bold text-sm flex-shrink-0 w-[14px] text-center">+</span>
              <span>Select <strong className="text-text">"Add to Home Screen"</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-secondary">
              <span className="text-accent-green flex-shrink-0 text-sm">✓</span>
              <span>Tap <strong className="text-text">"Add"</strong> to install</span>
            </div>
          </div>

          {/* Snooze — re-shows next session */}
          <button onClick={snooze}
            className="text-xs text-text-muted hover:text-text w-full text-center py-1.5 transition-colors">
            Remind me later
          </button>
        </div>
      </div>
    )
  }

  // ── Native prompt (Android / Chrome / Desktop) ───────────────────
  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] sm:left-auto sm:right-6 sm:w-80 animate-pop-in">
      <div className="glass-card p-4 shadow-card border-primary/30">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center text-2xl flex-shrink-0">
            🤫
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm mb-0.5">Install tryHushly</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              Faster, works offline &amp; get push notifications.
            </p>
          </div>
          {/* X = snooze 30 min only */}
          <button onClick={snooze} className="text-text-muted hover:text-text flex-shrink-0 p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="btn-primary flex-1 text-sm py-2 flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {installing
              ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Installing…</>
              : <><Download size={14} /> Install App</>
            }
          </button>
          {/* Later = snooze 30 min — not permanent dismiss */}
          <button onClick={snooze} className="btn-ghost text-sm py-2 px-4">
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
