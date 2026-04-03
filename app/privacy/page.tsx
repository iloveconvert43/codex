export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy | tryHushly',
  description: 'How tryHushly collects, uses, and protects your personal data.' }

const EFFECTIVE_DATE = 'January 1, 2025'
const LAST_UPDATED = 'January 1, 2025'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-5 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-text-muted hover:text-text transition-colors">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Shield size={22} className="text-primary" /> Privacy Policy
            </h1>
            <p className="text-xs text-text-muted mt-0.5">Effective: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}</p>
          </div>
        </div>

        {/* Privacy Promise Banner */}
        <div className="glass-card p-5 mb-10 border-primary/30 bg-primary-muted/10">
          <h2 className="font-black text-lg mb-3 text-primary">Our Privacy Promise to You</h2>
          <div className="space-y-2.5 text-sm">
            {[
              ['🔐', 'Your sensitive data (passwords, OTPs) is never stored in plain text — only cryptographic hashes.'],
              ['🚫', 'We do not sell, rent, or trade your personal information to any third party. Ever.'],
              ['👁️', 'tryHushly staff cannot read your private messages or anonymous posts.'],
              ['🗑️', 'You can delete your account and all associated data at any time, permanently.'],
              ['📵', 'We do not run advertisements. Your data is never used for ad targeting.'],
              ['🔒', 'All data is transmitted over HTTPS (TLS 1.3) and stored with encryption at rest.'],
              ['🌍', 'Anonymous posts are cryptographically separated from your identity at the database level.'],
            ].map(([emoji, text]) => (
              <p key={text as string} className="flex gap-3 text-text-secondary leading-relaxed">
                <span className="flex-shrink-0">{emoji}</span>
                <span>{text as string}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-10">

          <PolicySection id="information-we-collect" title="1. Information We Collect">
            <SubSection title="Information You Provide">
              <PolicyList items={[
                'Full name, date of birth, and gender (required for account creation)',
                'Email address or phone number (used for verification only)',
                'Profile information: username, display name, biography, profile photo',
                'Location data (only when you explicitly enable it for posts)',
                'Content you create: posts, comments, messages, stories',
                'Responses to anonymous questions you choose to answer',
              ]} />
            </SubSection>
            <SubSection title="Information Collected Automatically">
              <PolicyList items={[
                'IP address (used for rate limiting and fraud prevention, not stored long-term)',
                'Device type and browser (for optimizing your experience)',
                'App usage patterns: which features you use, how often',
                'Error logs (to fix bugs — never contains personal content)',
                'Location coordinates (only when you post with location enabled)',
              ]} />
            </SubSection>
            <SubSection title="What We Do NOT Collect">
              <PolicyList items={[
                'Your contacts or address book',
                'Photos or files from your device (only what you explicitly upload)',
                'Microphone or camera data',
                'Financial or payment information',
                'Device identifiers (IMEI, advertising IDs)',
              ]} bullet="✅" />
            </SubSection>
          </PolicySection>

          <PolicySection id="how-we-use" title="2. How We Use Your Information">
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              We use your data to provide and improve the tryHushly service. Specifically:
            </p>
            <PolicyList items={[
              'Account creation and authentication (verifying your identity via OTP)',
              'Delivering content to your feed, including nearby posts and room content',
              'Sending notifications about replies, reactions, and followers',
              'Improving our recommendation algorithm to show you more relevant content',
              'Detecting and preventing spam, abuse, and policy violations',
              'Sending transactional emails (e.g., password reset, OTP verification)',
              'Analyzing aggregate, anonymized usage patterns to improve the platform',
            ]} />
            <p className="text-text-secondary text-sm leading-relaxed mt-4 p-4 rounded-xl bg-bg-card border border-border">
              <strong className="text-text">We do not use your data for advertising.</strong> We
              never create advertising profiles, never share data with ad networks, and never
              allow third-party trackers on our platform.
            </p>
          </PolicySection>

          <PolicySection id="data-security" title="3. How We Protect Your Data">
            <SubSection title="Encryption & Hashing">
              <PolicyList items={[
                'Passwords are hashed using bcrypt (industry standard, cannot be reversed)',
                'OTP codes are stored only as SHA-256 hashes — we never store the actual code',
                'All data in transit uses TLS 1.3 encryption',
                'Database storage uses AES-256 encryption at rest (via Supabase)',
                'Anonymous post identity is stored separately from the post content using cryptographic separation',
              ]} />
            </SubSection>
            <SubSection title="Access Controls">
              <PolicyList items={[
                'Row-Level Security (RLS) enforced at the database level — every query is restricted to authorized data',
                'tryHushly employees cannot access your private messages or anonymous post identities',
                'Admin access requires separate authentication and is logged',
                'No developer has direct production database access without audit trail',
              ]} />
            </SubSection>
            <SubSection title="Anonymous Posts">
              <p className="text-text-secondary text-sm leading-relaxed">
                When you post anonymously, your user ID is stored in a separate, restricted
                table with additional access controls. The post itself contains no reference
                to your identity that is accessible through normal queries. Even our own
                staff cannot determine who made an anonymous post without a formal legal
                process and multi-person authorization.
              </p>
            </SubSection>
          </PolicySection>

          <PolicySection id="data-sharing" title="4. Information Sharing">
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              We share your data in only these limited circumstances:
            </p>
            <div className="space-y-4">
              {[
                {
                  title: 'Service Providers',
                  desc: 'We use Supabase (database hosting), Cloudflare (CDN and media storage), and Fast2SMS (OTP delivery). These providers are contractually bound to protect your data and cannot use it for their own purposes.' },
                {
                  title: 'Legal Requirements',
                  desc: 'We may disclose information if required by valid legal process (court order, subpoena). We will notify you before disclosure unless legally prohibited from doing so.' },
                {
                  title: 'Safety & Fraud Prevention',
                  desc: 'If we believe disclosure is necessary to prevent imminent harm, protect our users, or prevent fraud, we may share limited information with law enforcement.' },
                {
                  title: 'Business Transfers',
                  desc: 'If tryHushly is acquired or merges, your data may transfer. We will notify you and give you the option to delete your account before any transfer.' },
              ].map(({ title, desc }) => (
                <div key={title} className="p-4 rounded-xl bg-bg-card border border-border">
                  <h4 className="font-bold text-sm mb-1">{title}</h4>
                  <p className="text-text-muted text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-text-secondary text-sm leading-relaxed mt-4 font-semibold">
              We never sell your data. We never share data with advertisers.
            </p>
          </PolicySection>

          <PolicySection id="your-rights" title="5. Your Rights & Choices">
            <div className="space-y-4">
              {[
                {
                  right: '🔍 Access Your Data',
                  desc: 'Request a complete copy of all data we hold about you. We will provide it within 30 days.',
                  action: 'Email: privacy@tryhushly.com' },
                {
                  right: '✏️ Correct Your Data',
                  desc: 'Update or correct any inaccurate information from your Settings page.',
                  action: 'Available in Settings → Edit Profile' },
                {
                  right: '🗑️ Delete Your Account',
                  desc: 'Permanently delete your account and all associated data. Anonymous posts will be fully orphaned (no identity link). Deletion is irreversible.',
                  action: 'Settings → Account → Delete Account' },
                {
                  right: '📵 Opt-Out of Notifications',
                  desc: 'Control all notification types from your settings. Disable push notifications at any time.',
                  action: 'Settings → Notifications' },
                {
                  right: '📍 Location Control',
                  desc: 'Location is never collected passively. You choose per-post whether to include location.',
                  action: 'Toggle when creating a post' },
                {
                  right: '🔒 Privacy Controls',
                  desc: 'Control who can see each field of your profile (public/private) individually.',
                  action: 'Settings → Privacy' },
              ].map(({ right, desc, action }) => (
                <div key={right} className="p-4 rounded-xl bg-bg-card border border-border">
                  <h4 className="font-bold text-sm mb-1">{right}</h4>
                  <p className="text-text-muted text-sm leading-relaxed mb-2">{desc}</p>
                  <p className="text-xs text-primary font-medium">→ {action}</p>
                </div>
              ))}
            </div>
          </PolicySection>

          <PolicySection id="data-retention" title="6. Data Retention">
            <PolicyList items={[
              'Active account data: retained while your account is active',
              'Posts: retained until you delete them or close your account',
              'Messages: retained for 1 year after last activity in the conversation',
              'OTP codes: deleted immediately after use or after 5-minute expiry',
              'Login attempt logs: retained for 90 days for security purposes',
              'Analytics events: anonymized and aggregated after 30 days',
              'Deleted account data: fully removed within 30 days of deletion request',
              'Backups: purged within 90 days of account deletion',
            ]} />
          </PolicySection>

          <PolicySection id="minors" title="7. Children's Privacy">
            <p className="text-text-secondary text-sm leading-relaxed">
              tryHushly is not intended for children under the age of 13. We require users
              to confirm they are at least 13 years old during registration. If we become
              aware that a child under 13 has provided personal information, we will
              immediately delete their account and all associated data.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed mt-3">
              If you believe a child under 13 is using tryHushly, please contact us
              immediately at <a href="mailto:safety@tryhushly.com" className="text-primary hover:underline">safety@tryhushly.com</a>.
            </p>
          </PolicySection>

          <PolicySection id="cookies" title="8. Cookies & Local Storage">
            <p className="text-text-secondary text-sm leading-relaxed mb-3">
              We use minimal, strictly necessary storage:
            </p>
            <PolicyList items={[
              'Authentication session (localStorage) — keeps you logged in',
              'App preferences (localStorage) — remembers your settings locally',
              'No third-party cookies',
              'No advertising cookies',
              'No cross-site tracking',
            ]} />
          </PolicySection>

          <PolicySection id="third-parties" title="9. Third-Party Services">
            <div className="space-y-3 text-sm">
              {[
                { name: 'Supabase', role: 'Database, authentication, realtime', link: 'https://supabase.com/privacy' },
                { name: 'Cloudflare R2', role: 'Media storage and CDN', link: 'https://www.cloudflare.com/privacypolicy/' },
                { name: 'Vercel', role: 'Application hosting', link: 'https://vercel.com/legal/privacy-policy' },
                { name: 'Fast2SMS', role: 'SMS OTP delivery (India)', link: 'https://www.fast2sms.com/privacy-policy' },
              ].map(({ name, role, link }) => (
                <div key={name} className="flex items-start justify-between p-3 rounded-xl bg-bg-card border border-border gap-3">
                  <div>
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-text-muted text-xs">{role}</p>
                  </div>
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0">Privacy Policy ↗</a>
                </div>
              ))}
            </div>
          </PolicySection>

          <PolicySection id="changes" title="10. Changes to This Policy">
            <p className="text-text-secondary text-sm leading-relaxed">
              We may update this Privacy Policy from time to time. When we do, we will:
            </p>
            <PolicyList items={[
              'Update the "Last Updated" date at the top of this page',
              'Send an in-app notification for significant changes',
              'Email registered users about material changes',
              'Provide at least 14 days notice before changes take effect',
            ]} />
          </PolicySection>

          <PolicySection id="contact" title="11. Contact Us">
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              For any privacy-related questions, requests, or concerns:
            </p>
            <div className="space-y-2 text-sm">
              <p className="flex gap-3"><span className="text-text-muted w-20 flex-shrink-0">Email:</span><a href="mailto:privacy@tryhushly.com" className="text-primary hover:underline">privacy@tryhushly.com</a></p>
              <p className="flex gap-3"><span className="text-text-muted w-20 flex-shrink-0">Response:</span><span className="text-text-secondary">Within 48 hours for privacy requests</span></p>
              <p className="flex gap-3"><span className="text-text-muted w-20 flex-shrink-0">Data req:</span><span className="text-text-secondary">Fulfilled within 30 days</span></p>
            </div>
          </PolicySection>

        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-text-muted">© 2025 tryHushly. All rights reserved.</p>
          <div className="flex gap-4 text-xs">
            <Link href="/about" className="text-text-muted hover:text-primary transition-colors">About</Link>
            <Link href="/terms" className="text-text-muted hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function PolicySection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2 className="text-lg font-black mb-4 flex items-center gap-3">
        <span className="w-1 h-5 bg-gradient-to-b from-primary to-accent-red rounded-full" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="font-bold text-sm text-text mb-2">{title}</h3>
      {children}
    </div>
  )
}

function PolicyList({ items, bullet = '•' }: { items: string[]; bullet?: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm text-text-secondary leading-relaxed">
          <span className="flex-shrink-0 text-text-muted mt-0.5">{bullet}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
