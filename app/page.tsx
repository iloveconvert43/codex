'use client'

import { useState, useEffect } from 'react'
import NextDynamic from 'next/dynamic'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import RightSidebar from '@/components/layout/RightSidebar'
import FeedList from '@/components/feed/FeedList'
import FilterBar from '@/components/feed/FilterBar'
import BrandLogo from '@/components/ui/BrandLogo'
import type { FeedFilter } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { useUserStore } from '@/store/userStore'

const ChallengeCard = NextDynamic(() => import('@/components/challenge/ChallengeCard'), { ssr: false })
const StoriesBar    = NextDynamic(() => import('@/components/feed/StoriesBar'), { ssr: false })

// ── Feed Page (logged-in) ─────────────────────────────────────────
function FeedPage() {
  const [filter, setFilter]           = useState<FeedFilter>('global')
  const [selectedCity, setSelectedCity] = useState<string | null>(null)

  function handleFilterChange(newFilter: FeedFilter, city?: string) {
    setFilter(newFilter)
    if (city) setSelectedCity(city)
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden flex flex-col h-screen">
        <TopBar />
        <main className="flex-1 overflow-y-auto hide-scrollbar pb-nav">
          <div className="feed-container">
            <StoriesBar />
            <FilterBar active={filter} onChange={handleFilterChange} selectedCity={selectedCity} />
            {(filter === 'global' || filter === 'friends') && <ChallengeCard />}
            <FeedList filter={filter} selectedCity={selectedCity} />
          </div>
        </main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3">
            <BrandLogo size="sm" />
          </div>
          <div className="max-w-2xl mx-auto">
            <StoriesBar />
            <FilterBar active={filter} onChange={handleFilterChange} selectedCity={selectedCity} />
            {(filter === 'global' || filter === 'friends') && <ChallengeCard />}
            <FeedList filter={filter} selectedCity={selectedCity} />
          </div>
        </main>
        <RightSidebar />
      </div>
    </div>
  )
}

// ── Landing Page — Futuristic Split Screen ───────────────────────
function LandingPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const features = [
    { icon: '🎭', title: 'Anonymous Identity', desc: 'No real names, no phone links, no IP tracking.' },
    { icon: '🔒', title: 'Zero Data Selling', desc: 'Your thoughts are never sold or shared.' },
    { icon: '📍', title: 'Hyperlocal Feed', desc: 'Real voices from people in your city.' },
    { icon: '🔥', title: 'Mystery Posts', desc: 'Identity revealed only after enough reactions.' },
    { icon: '💬', title: 'Private Messaging', desc: 'End-to-end conversations, fully anonymous.' },
    { icon: '📸', title: 'Stories & Media', desc: 'Share moments that disappear after 24h.' },
  ]

  return (
    <div className="min-h-[100dvh] bg-bg text-text overflow-x-hidden">
      <style>{`
        @keyframes orbMove1 { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(40px,-30px) scale(1.1)} 50%{transform:translate(-20px,-60px) scale(0.9)} 75%{transform:translate(-40px,20px) scale(1.05)} }
        @keyframes orbMove2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-30px,40px) scale(1.15)} 66%{transform:translate(35px,-25px) scale(0.92)} }
        @keyframes orbMove3 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(20px,35px) scale(1.08)} 80%{transform:translate(-25px,-15px) scale(0.95)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ringPulse { 0%,100%{transform:scale(1);opacity:0.15} 50%{transform:scale(1.15);opacity:0.05} }
        @keyframes lineGlow { 0%{transform:translateY(100%)} 100%{transform:translateY(-100%)} }
        .anim-up { opacity:0; animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
        .anim-d1 { animation-delay:0.1s } .anim-d2 { animation-delay:0.2s } .anim-d3 { animation-delay:0.3s }
        .anim-d4 { animation-delay:0.4s } .anim-d5 { animation-delay:0.5s } .anim-d6 { animation-delay:0.6s }
      `}</style>

      {/* ═══════════ HERO — FULL VIEWPORT SPLIT ═══════════ */}
      <section className="min-h-[100dvh] flex flex-col lg:flex-row">

        {/* ── LEFT PANEL — Futuristic Art ── */}
        <div className="relative lg:w-[48%] min-h-[45vh] lg:min-h-[100dvh] bg-[#060610] overflow-hidden flex-shrink-0">
          {/* Animated gradient orbs */}
          <div className="absolute w-[340px] h-[340px] rounded-full bg-primary/30 blur-[100px] top-[15%] left-[20%] pointer-events-none" style={{ animation: 'orbMove1 12s ease-in-out infinite' }} />
          <div className="absolute w-[280px] h-[280px] rounded-full bg-accent-red/25 blur-[90px] bottom-[20%] right-[15%] pointer-events-none" style={{ animation: 'orbMove2 10s ease-in-out infinite' }} />
          <div className="absolute w-[200px] h-[200px] rounded-full bg-accent-green/15 blur-[80px] top-[50%] left-[50%] pointer-events-none" style={{ animation: 'orbMove3 14s ease-in-out infinite' }} />

          {/* Geometric rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/[0.04] pointer-events-none" style={{ animation: 'ringPulse 6s ease-in-out infinite' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full border border-primary/[0.08] pointer-events-none" style={{ animation: 'ringPulse 6s ease-in-out infinite 1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[160px] h-[160px] rounded-full border border-accent-red/[0.1] pointer-events-none" style={{ animation: 'ringPulse 6s ease-in-out infinite 2s' }} />

          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(rgba(108,99,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(108,99,255,0.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

          {/* Glowing vertical line */}
          <div className="absolute right-0 top-0 bottom-0 w-px overflow-hidden">
            <div className="w-full h-[200px] bg-gradient-to-b from-transparent via-primary/40 to-transparent" style={{ animation: 'lineGlow 4s linear infinite' }} />
          </div>

          {/* Brand + content overlay */}
          <div className="relative z-10 flex flex-col h-full p-8 lg:p-12">
            <BrandLogo size="md" />

            <div className="flex-1 flex flex-col justify-center max-w-[380px]">
              <h1 className={`text-3xl lg:text-[44px] font-black leading-[1.1] tracking-tight mb-5 ${mounted ? 'anim-up' : 'opacity-0'}`}>
                Where your{' '}
                <span className="gradient-text">identity</span>
                <br />stays yours.
              </h1>
              <p className={`text-base lg:text-lg text-white/50 leading-relaxed ${mounted ? 'anim-up anim-d1' : 'opacity-0'}`}>
                The anonymous social platform built for honest expression. No tracking, no ads, no judgement.
              </p>
            </div>

            {/* Floating stats at bottom */}
            <div className={`flex gap-8 ${mounted ? 'anim-up anim-d3' : 'opacity-0'}`}>
              {[
                { n: '24K+', l: 'Users' },
                { n: '47', l: 'Cities' },
                { n: '0', l: 'Data sold' },
              ].map(s => (
                <div key={s.l}>
                  <p className="text-xl font-black text-white/90">{s.n}</p>
                  <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — Content + CTA ── */}
        <div className="flex-1 flex flex-col min-h-[55vh] lg:min-h-[100dvh]">
          {/* Top nav */}
          <div className="flex items-center justify-end gap-2 p-5 lg:p-8">
            <Link href="/login"
              className="text-sm text-text-secondary hover:text-text transition-colors px-4 py-2.5 rounded-xl hover:bg-white/5">
              Log in
            </Link>
            <Link href="/signup"
              className="text-sm font-semibold bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/20">
              Sign up
            </Link>
          </div>

          {/* Main content centered */}
          <div className="flex-1 flex items-center justify-center px-6 lg:px-16 pb-8">
            <div className="w-full max-w-[460px]">
              {/* Mobile-only headline (shows on small screens where left panel is short) */}
              <div className="lg:hidden mb-8">
                <h2 className={`text-2xl font-black mb-3 ${mounted ? 'anim-up' : 'opacity-0'}`}>
                  Join <span className="gradient-text">tryHushly</span>
                </h2>
                <p className={`text-sm text-text-secondary ${mounted ? 'anim-up anim-d1' : 'opacity-0'}`}>
                  The anonymous social platform for honest expression.
                </p>
              </div>

              {/* Desktop headline */}
              <div className={`hidden lg:block mb-10 ${mounted ? 'anim-up' : 'opacity-0'}`}>
                <p className="text-sm font-semibold text-primary mb-2">Get started for free</p>
                <h2 className="text-3xl font-black leading-tight">
                  Create your account
                </h2>
                <p className="text-text-secondary mt-3 text-[15px] leading-relaxed">
                  Join thousands of people sharing their real thoughts anonymously.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className={`space-y-3 mb-8 ${mounted ? 'anim-up anim-d2' : 'opacity-0'}`}>
                <Link href="/signup"
                  className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-hover text-white font-semibold py-4 rounded-xl text-base transition-all duration-200 active:scale-[0.97] shadow-lg shadow-primary/25">
                  Create account
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </Link>
                <Link href="/login"
                  className="flex items-center justify-center gap-2 w-full bg-white/[0.03] hover:bg-white/[0.06] border border-border hover:border-primary/30 text-text font-medium py-4 rounded-xl text-base transition-all duration-200">
                  Already have an account? Log in
                </Link>
              </div>

              {/* Trust signals */}
              <div className={`flex flex-wrap gap-4 text-sm text-text-muted mb-10 ${mounted ? 'anim-up anim-d3' : 'opacity-0'}`}>
                {[
                  { icon: <svg className="w-4 h-4 text-accent-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>, t: 'Fully anonymous' },
                  { icon: <svg className="w-4 h-4 text-accent-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>, t: 'No data selling' },
                  { icon: <svg className="w-4 h-4 text-accent-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>, t: 'Free forever' },
                ].map(s => (
                  <span key={s.t} className="flex items-center gap-1.5">{s.icon}{s.t}</span>
                ))}
              </div>

              {/* Divider */}
              <div className={`border-t border-border pt-8 ${mounted ? 'anim-up anim-d4' : 'opacity-0'}`}>
                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-5">Why tryHushly?</p>
                <div className="grid grid-cols-2 gap-3">
                  {features.map((f, i) => (
                    <div key={f.title} className={`flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-primary/15 transition-colors ${mounted ? `anim-up anim-d${Math.min(i + 4, 6)}` : 'opacity-0'}`}>
                      <span className="text-lg flex-shrink-0 mt-0.5">{f.icon}</span>
                      <div>
                        <p className="text-[13px] font-semibold leading-tight">{f.title}</p>
                        <p className="text-[11px] text-text-muted leading-snug mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 lg:px-16 pb-6 flex items-center justify-between text-xs text-text-muted">
            <span>&copy; 2025&ndash;2026 tryHushly</span>
            <div className="flex gap-4">
              <Link href="/about" className="hover:text-text transition-colors">About</Link>
              <Link href="/privacy" className="hover:text-text transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-text transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Loading Spinner ───────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent-red flex items-center justify-center text-3xl shadow-glow">
          🤫
        </div>
        <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────
export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const { profile, loading } = useAuth()
  const supaUser = useUserStore(s => s.supaUser)
  const initialized = useUserStore(s => s.initialized)
  const storeProfile = useUserStore(s => s.profile)
  const [hardTimeout, setHardTimeout] = useState(false)

  // Prevent hydration mismatch — always render spinner on first render (matches SSR)
  useEffect(() => { setMounted(true) }, [])

  // Hard 2s timeout — never show spinner more than 2 seconds
  useEffect(() => {
    const t = setTimeout(() => setHardTimeout(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Before mount on SSR, always show spinner (matches server render)
  if (!mounted) return <LoadingSpinner />

  // Use either hook profile or store profile — whichever is available first
  const isLoggedIn = !!supaUser && !!(profile || storeProfile)
  if (isLoggedIn) return <FeedPage />

  // Show spinner only briefly while auth resolves (initial page load)
  const authPending = !initialized || (supaUser && loading && !profile && !storeProfile)
  if (authPending && !hardTimeout) return <LoadingSpinner />

  // Auth resolved (or timed out) with no user — show landing
  return <LandingPage />
}
