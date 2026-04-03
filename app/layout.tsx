import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, DM_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300','400','500','600','700'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: true,
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400','500'],
  variable: '--font-dm-mono',
  display: 'swap',
  preload: false,
})
import { Toaster } from 'react-hot-toast'
import GlobalCallUI from '@/components/call/GlobalCallUI'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import Providers from '@/components/ui/Providers'
import PWAInstallPrompt from '@/components/ui/PWAInstallPrompt'
import NetworkStatus from '@/components/ui/NetworkStatus'
import BackButtonHandler from '@/components/ui/BackButtonHandler'

export const metadata: Metadata = {
  title: 'tryHushly — Say what you can\'t say anywhere else.',
  description: 'Someone nearby just said something... Tap to reveal.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'tryHushly' },
  openGraph: {
    title: 'tryHushly',
    description: 'Say what you can\'t say anywhere else.',
    type: 'website',
    siteName: 'tryHushly' },
  twitter: {
    card: 'summary_large_image',
    title: 'tryHushly',
    description: 'Say what you can\'t say anywhere else.' },
  robots: { index: true, follow: true } }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A0A0F',
  viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Capture beforeinstallprompt ASAP */}
        <script dangerouslySetInnerHTML={{ __html: `
          // PWA install prompt capture — must run before any React code
          window.__pwaPromptEvent = null;
          window.__pwaInstalled = localStorage.getItem('pwa-installed') === '1';
          if (!window.__pwaInstalled) {
            // Check if already running as PWA
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
              window.__pwaInstalled = true;
              localStorage.setItem('pwa-installed', '1');
            } else {
              // Capture the prompt event as early as possible
              window.addEventListener('beforeinstallprompt', function handler(e) {
                e.preventDefault();
                window.__pwaPromptEvent = e;
                window.removeEventListener('beforeinstallprompt', handler);
                // Dispatch custom event so React components can react
                window.dispatchEvent(new CustomEvent('pwa-prompt-ready'));
              });
            }
          }
        `}} />
        {/* Prefetch critical resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} />
        {/* Theme init — runs before hydration to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('hushly-theme');
              var p = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              var theme = t || p;
              document.documentElement.setAttribute('data-theme', theme);
              document.documentElement.classList.add(theme);
            } catch(e) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          })();
        `}} />
      </head>
      <body className="bg-bg text-text antialiased overscroll-none" suppressHydrationWarning>
        <Providers>
          <NetworkStatus />
          <BackButtonHandler />
          <ErrorBoundary>{children}</ErrorBoundary>
          <PWAInstallPrompt />
          <GlobalCallUI />
        <Toaster
            position="top-center"
            gutter={8}
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1C1C26',
                color: '#F0EFF8',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                maxWidth: '360px' },
              success: { iconTheme: { primary: '#6BCB77', secondary: '#1C1C26' } },
              error: { iconTheme: { primary: '#FF6B6B', secondary: '#1C1C26' } } }}
          />
        </Providers>
      </body>
    </html>
  )
}
