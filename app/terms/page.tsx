export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, FileText } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service | tryHushly',
  description: 'Terms and conditions for using tryHushly.' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-5 py-10">

        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-text-muted hover:text-text transition-colors">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <FileText size={22} className="text-primary" /> Terms of Service
            </h1>
            <p className="text-xs text-text-muted mt-0.5">Effective: January 1, 2025</p>
          </div>
        </div>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">

          <p>
            Welcome to tryHushly. By using our service, you agree to these Terms of Service.
            Please read them carefully. If you disagree with any part, you may not use tryHushly.
          </p>

          {[
            {
              title: '1. Eligibility',
              content: 'You must be at least 13 years old to use tryHushly. By creating an account, you confirm that you meet this requirement. Users between 13 and 18 should review these terms with a parent or guardian.'
            },
            {
              title: '2. Your Account',
              content: 'You are responsible for all activity on your account. Keep your password secure. You may not transfer, sell, or share your account. We may suspend or terminate accounts that violate these terms.'
            },
            {
              title: '3. Content Rules',
              items: [
                'No content that exploits or harms minors in any way',
                'No harassment, bullying, threats, or hate speech',
                'No content that promotes self-harm or suicide',
                'No spam, scams, or misleading information',
                'No content that infringes on others\' intellectual property',
                'No illegal content of any kind',
                'Anonymous posting does not exempt you from these rules',
              ]
            },
            {
              title: '4. Anonymous Content',
              content: 'Anonymous posts are still subject to our content rules. While your identity is protected from other users, tryHushly may identify accounts behind anonymous posts when required by law enforcement or to prevent serious harm. Anonymity is a feature, not a shield for abuse.'
            },
            {
              title: '5. Intellectual Property',
              content: 'You retain ownership of content you create. By posting, you grant tryHushly a non-exclusive, royalty-free license to display, distribute, and promote your content within the platform. We will not use your content for advertising without your explicit consent.'
            },
            {
              title: '6. Privacy',
              content: 'Your use of tryHushly is also governed by our Privacy Policy, which is incorporated into these terms. We take your privacy seriously — please read our full Privacy Policy.'
            },
            {
              title: '7. Disclaimer',
              content: 'tryHushly is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service. We are not responsible for user-generated content or the actions of other users.'
            },
            {
              title: '8. Limitation of Liability',
              content: 'To the maximum extent permitted by law, tryHushly is not liable for indirect, incidental, or consequential damages arising from your use of the service.'
            },
            {
              title: '9. Changes to Terms',
              content: 'We may update these terms. We will notify you of significant changes via in-app notification. Continued use after changes constitutes acceptance of the new terms.'
            },
            {
              title: '10. Contact',
              content: 'For questions about these terms, contact us at: legal@tryhushly.com'
            },
          ].map(({ title, content, items }) => (
            <section key={title}>
              <h2 className="font-black text-text mb-2">{title}</h2>
              {content && <p>{content}</p>}
              {items && (
                <ul className="space-y-1.5 mt-2">
                  {items.map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="text-text-muted flex-shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-text-muted">© 2025 tryHushly</p>
          <div className="flex gap-4 text-xs">
            <Link href="/about" className="text-text-muted hover:text-primary">About</Link>
            <Link href="/privacy" className="text-text-muted hover:text-primary">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
