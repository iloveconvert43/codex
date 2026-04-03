export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import BrandLogo from '@/components/ui/BrandLogo'

export const metadata: Metadata = {
  title: 'About Us | tryHushly',
  description: 'Learn about tryHushly — the anonymous social platform built for honest, hyperlocal conversations.' }

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-5 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <Link href="/" className="text-text-muted hover:text-text transition-colors">
            <ArrowLeft size={22} />
          </Link>
          <BrandLogo size="md" />
        </div>

        {/* Hero */}
        <div className="mb-12 text-center">
          <p className="text-4xl mb-4">🤫</p>
          <h1 className="text-3xl font-black mb-3">Say what you can't say anywhere else.</h1>
          <p className="text-text-secondary leading-relaxed">
            tryHushly is an anonymous social platform where real people share real thoughts —
            without filters, without judgment, without fear.
          </p>
        </div>

        {/* Mission */}
        <Section title="Our Mission">
          <p className="text-text-secondary leading-relaxed">
            We believe every person deserves a space to express themselves authentically.
            Social media today rewards performance over honesty. People curate, filter, and
            hide behind perfectly crafted personas. tryHushly is the antidote.
          </p>
          <p className="text-text-secondary leading-relaxed mt-3">
            We built a platform where what you say matters more than who you are,
            where your neighborhood connects you with people who truly understand your world,
            and where vulnerability is a strength — not a risk.
          </p>
        </Section>

        {/* What makes us different */}
        <Section title="What Makes tryHushly Different">
          <div className="space-y-4">
            {[
              {
                emoji: '🎭',
                title: 'True Anonymity',
                desc: 'Post anonymously whenever you want. Your identity is never linked to anonymous content — not even by us.' },
              {
                emoji: '🎯',
                title: 'Mystery Posts',
                desc: 'Share something that only reveals itself when people engage. Creates genuine curiosity and connection.' },
              {
                emoji: '📍',
                title: 'Hyperlocal Discovery',
                desc: 'See what people near you are thinking and sharing right now. Your city, your neighborhood, your people.' },
              {
                emoji: '💬',
                title: 'Topic Rooms',
                desc: 'Join communities built around shared interests — from midnight thoughts to career rants to relationship chronicles.' },
              {
                emoji: '🏆',
                title: 'Curiosity Points',
                desc: 'We reward authentic engagement. The more genuinely you connect, the more you grow on the platform.' },
              {
                emoji: '🤫',
                title: 'Anonymous Q&A',
                desc: 'Let people ask you anything — anonymously. You answer publicly. Real questions, honest answers.' },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-4 p-4 rounded-2xl bg-bg-card border border-border">
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div>
                  <h3 className="font-bold text-sm mb-1">{title}</h3>
                  <p className="text-text-muted text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Our values */}
        <Section title="Our Values">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['🔒', 'Privacy First', 'Your privacy is not a feature — it\'s a foundation.'],
              ['🫂', 'Empathy', 'We design for real human vulnerability.'],
              ['⚖️', 'Safety', 'Anonymous doesn\'t mean lawless. We moderate strictly.'],
              ['🌍', 'Community', 'Local connections create real belonging.'],
            ].map(([emoji, title, desc]) => (
              <div key={title as string} className="p-4 rounded-2xl bg-bg-card border border-border">
                <p className="text-2xl mb-2">{emoji}</p>
                <h3 className="font-bold text-sm mb-1">{title as string}</h3>
                <p className="text-text-muted text-xs leading-relaxed">{desc as string}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Team */}
        <Section title="Built With Purpose">
          <p className="text-text-secondary leading-relaxed">
            tryHushly was created because we were tired of social media that rewards
            the loudest voices, the prettiest photos, and the most followers.
            We wanted to build something for the rest of us — for the thoughts you
            have at 3am, the opinions you're afraid to share, the questions you
            want to ask but can't.
          </p>
          <p className="text-text-secondary leading-relaxed mt-3">
            We are a small, passionate team obsessed with building technology that
            respects users. We don't run ads. We don't sell your data.
            We make money when you find genuine value in the platform.
          </p>
        </Section>

        {/* Contact */}
        <Section title="Get In Touch">
          <p className="text-text-secondary leading-relaxed mb-4">
            Have feedback? A feature idea? A safety concern? We want to hear from you.
          </p>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="text-text-muted w-20">General:</span>
              <a href="mailto:hello@tryhushly.com" className="text-primary hover:underline">hello@tryhushly.com</a>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-text-muted w-20">Support:</span>
              <a href="mailto:support@tryhushly.com" className="text-primary hover:underline">support@tryhushly.com</a>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-text-muted w-20">Safety:</span>
              <a href="mailto:safety@tryhushly.com" className="text-primary hover:underline">safety@tryhushly.com</a>
            </p>
          </div>
        </Section>

        {/* Legal links */}
        <div className="mt-12 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-text-muted">© 2025 tryHushly. All rights reserved.</p>
          <div className="flex gap-4 text-xs">
            <Link href="/privacy" className="text-text-muted hover:text-primary transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-text-muted hover:text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-black mb-5 flex items-center gap-3">
        <span className="w-1 h-6 bg-gradient-to-b from-primary to-accent-red rounded-full inline-block" />
        {title}
      </h2>
      {children}
    </section>
  )
}
