/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // Import custom service worker for call notifications
  extendDefaultRuntimeCaching: true,
  customWorkerSrc: 'sw-call.js',
  workboxOptions: {
    disableDevLogs: true,
    importScripts: ['/sw-call.js'],
    runtimeCaching: [
      {
        urlPattern: /^\/api\/feed/,
        handler: 'NetworkFirst',
        options: { cacheName: 'feed-cache', expiration: { maxEntries: 5, maxAgeSeconds: 300 } },
      },
      {
        urlPattern: /\.(js|css|woff2?)$/,
        handler: 'CacheFirst',
        options: { cacheName: 'static-cache', expiration: { maxEntries: 100, maxAgeSeconds: 2592000 } },
      },
      {
        urlPattern: /\.(png|jpg|jpeg|webp|avif|svg|ico|gif)$/,
        handler: 'CacheFirst',
        options: { cacheName: 'image-cache', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } },
      },
    ],
  },
})

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Permissions-Policy',       value: 'camera=(self), microphone=(self), geolocation=(self)' },
]

const nextConfig = {
  // Prevent static prerendering errors on client-only pages
  staticPageGenerationTimeout: 1000,
  typescript: {
    ignoreBuildErrors: true,  // TypeScript errors won't fail the build
  },
  eslint: {
    ignoreDuringBuilds: true,  // ESLint warnings won't fail the build
  },
  poweredByHeader: false,
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'ik.imagekit.io' },
      { protocol: 'https', hostname: '*.imagekit.io' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 86400,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },

  // Remove experimental features that need extra packages
  // Remove redirects that might conflict with middleware
  
  swcMinify: true,

  // Performance: reduce JS bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
}

module.exports = withPWA(nextConfig)
