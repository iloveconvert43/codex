/**
 * lib/imagekit.ts — ImageKit CDN
 *
 * Facebook's "main secret": never serve the original image.
 * Always serve an optimized version via CDN transforms.
 *
 * Context-aware URL transforms:
 *   thumbnail : w-40,  q-30, f-webp  (blur placeholder, ~3KB)
 *   feed      : w-800, q-70, f-webp  (ChatGPT: w-800, q-70)
 *   profile   : w-600, q-75, f-webp
 *   avatar    : w-200, h-200, c-at_max, q-80, f-webp
 *   cover     : w-1200,h-400, c-at_max, q-75, f-webp
 *   story     : w-720, q-75, f-webp
 *   full      : w-1080,q-85, f-webp  (max resolution)
 */

// IMPORTANT: Use process.env.NEXT_PUBLIC_* directly so Next.js inlines them at build time.
// Do NOT wrap in a function — that breaks client-side code where process.env is not available.
export const IMAGEKIT_URL        = process.env.NEXT_PUBLIC_IMAGEKIT_URL || 'https://ik.imagekit.io/tryhushly'
export const IMAGEKIT_PUBLIC_KEY = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || ''
// NOTE: Private key is read at call time inside signImageKitUpload(),
// NOT at module init, to ensure it's available on Vercel serverless
// Private key is only available server-side — read at call time
const _IMAGEKIT_PRIVATE_KEY_CACHED = typeof process !== 'undefined' ? (process.env.IMAGEKIT_PRIVATE_KEY || '') : ''

// ── Allowed types ────────────────────────────────────────────
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
]
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4','video/webm','video/quicktime','video/x-m4v','video/mpeg','video/3gpp',
]
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm','audio/mp4','audio/mpeg','audio/mp3','audio/wav','audio/x-wav',
  'audio/aac','audio/ogg','audio/x-m4a','audio/m4a',
]
export const IMAGE_MAX_BYTES        = 10 * 1024 * 1024
export const VIDEO_MAX_BYTES        = 150 * 1024 * 1024
export const AUDIO_MAX_BYTES        = 25 * 1024 * 1024
export const VIDEO_MAX_DURATION_SEC = 60

// ── Folders ───────────────────────────────────────────────────
// ImageKit folder paths are relative to the ImageKit media library root
// Do NOT include the ImageKit ID (tryhushly) — that's part of the URL endpoint
const FOLDERS: Record<string, string> = {
  images:  'posts',
  videos:  'videos',
  audio:   'audio',
  avatars: 'avatars',
  covers:  'covers',
}
export function getFolder(type: string): string {
  return FOLDERS[type] ?? 'media'
}

export function generateFileName(p: { type: string; userId: string; mimeType: string }): string {
  return `${p.userId.slice(0,8)}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.${mimeToExt(p.mimeType)}`
}

function mimeToExt(m: string): string {
  return ({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
            'image/heic':'heic','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov',
            'audio/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav',
            'audio/x-wav':'wav','audio/aac':'aac','audio/ogg':'ogg','audio/x-m4a':'m4a','audio/m4a':'m4a' } as any)[m] ?? 'bin'
}

// ── Server-side HMAC signing ─────────────────────────────────
// Uses Node.js crypto.createHmac (same as ImageKit official SDK)
// NOTE: require() used instead of import to prevent client-side bundling issues
// This function is ONLY called from server API routes (presign endpoint)
export function signImageKitUpload(token: string, expire: number): string {
  // Read private key at CALL TIME (not module init) to ensure Vercel env is loaded
  const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || _IMAGEKIT_PRIVATE_KEY_CACHED || '').trim()
  if (!privateKey) {
    console.error('[imagekit] IMAGEKIT_PRIVATE_KEY is empty! Check Vercel environment variables.')
    throw new Error('IMAGEKIT_PRIVATE_KEY env var not set')
  }

  // ImageKit upload auth expects a plain SHA1 hash of token + expire + privateKey
  // (not an HMAC). Using HMAC causes "invalid signature parameter" on upload.
  const message = `${token}${expire}${privateKey}`
  const nodeCrypto = require('crypto')
  const signature = nodeCrypto
    .createHash('sha1')
    .update(message)
    .digest('hex')

  if (process.env.NODE_ENV !== 'production') {
    console.log('[imagekit] Signature generated:', {
      tokenPrefix: token.slice(0, 8),
      expire,
      sigPrefix: signature.slice(0, 10),
      messageLen: message.length,
    })
  }

  return signature
}

// ── Facebook-style context transforms ────────────────────────
// PERFORMANCE: pr-true = progressive JPEG (renders blurry then sharpens)
// f-webp = WebP (30-40% smaller than JPEG at same quality)
// bl-N  = blur (LQIP placeholder — loads in ~1KB then swaps to full)
const TRANSFORMS: Record<string, string> = {
  // ── Placeholders (instant ~1KB blur, shown while full image loads) ──
  lqip:      'tr:w-20,q-10,f-webp,bl-10',       // 1KB LQIP blur
  thumbnail: 'tr:w-80,q-30,f-webp,bl-4',        // small thumbnail

  // ── Feed images (most important — what users see first) ──
  feed:      'tr:w-720,q-75,f-webp,pr-true',    // mobile-first (720px)
  feed_2x:   'tr:w-1440,q-70,f-webp,pr-true',   // retina displays

  // ── Profile ──
  profile:   'tr:w-600,q-75,f-webp,pr-true',
  avatar:    'tr:w-160,h-160,c-at_max,q-85,f-webp',   // 160px avatar
  avatar_sm: 'tr:w-64,h-64,c-at_max,q-80,f-webp',    // 32px inline
  cover:     'tr:w-1200,h-380,c-at_max,q-75,f-webp,pr-true',

  // ── Stories (vertical format) ──
  story:     'tr:w-480,q-78,f-webp,pr-true',    // 480px story

  // ── Full screen / modal ──
  full:      'tr:w-1080,q-82,f-webp,pr-true',

  // ── Mobile slow connection ──
  mobile:    'tr:w-400,q-65,f-webp,pr-true',
}

/**
 * Get Low Quality Image Placeholder (LQIP) URL
 * Shows instantly (~1KB), then full image loads in background
 * Usage: <img src={getLQIP(url)} onLoad={() => setFullLoaded(true)} />
 */
export function getLQIPUrl(url: string): string {
  return getOptimizedUrl(url, 'lqip')
}

/**
 * Get context-aware optimized URL (Facebook "main secret")
 * NEVER serves original image — always a CDN-transformed version
 */
export function getOptimizedUrl(url: string, context: keyof typeof TRANSFORMS = 'feed'): string {
  if (!url) return ''
  if (!url.includes('imagekit.io')) return url  // non-imagekit, pass through
  // Safety: if IMAGEKIT_URL is empty, return the original URL as-is
  if (!IMAGEKIT_URL) return url

  const clean = url.replace(/\/tr:[^/]+/, '')  // strip any existing transform
  // Extract the path after the ImageKit base URL (e.g., /posts/file.webp)
  const ikBase = 'https://ik.imagekit.io/tryhushly'
  const base = IMAGEKIT_URL || ikBase
  const path  = clean.startsWith(base)
    ? clean.slice(base.length)
    : clean.startsWith(ikBase)
      ? clean.slice(ikBase.length)
      : `/${clean.split('/').slice(4).join('/')}`

  return `${base}/${TRANSFORMS[context]}${path}`
}

/**
 * Build URL with custom transform params
 */
export function buildImageUrl(pathOrUrl: string, opts: {
  w?: number; h?: number; quality?: number
  format?: 'webp'|'avif'|'jpg'; fit?: 'cover'|'contain'
  blur?: number; progressive?: boolean
} = {}): string {
  if (!pathOrUrl) return ''
  const t: string[] = []
  if (opts.w)                  t.push(`w-${opts.w}`)
  if (opts.h)                  t.push(`h-${opts.h}`)
  if (opts.quality)            t.push(`q-${opts.quality}`)
  if (opts.format)             t.push(`f-${opts.format}`)
  if (opts.blur)               t.push(`bl-${opts.blur}`)
  if (opts.fit === 'cover')    t.push('c-at_max')
  if (opts.progressive !== false) t.push('pr-true')

  const tr    = t.length ? `tr:${t.join(',')}` : ''
  const clean = pathOrUrl.includes('imagekit.io')
    ? pathOrUrl.replace(/\/tr:[^/]+/, '')
    : pathOrUrl
  const path  = clean.startsWith(IMAGEKIT_URL)
    ? clean.slice(IMAGEKIT_URL.length)
    : clean.startsWith('/') ? clean : `/${clean}`

  return tr ? `${IMAGEKIT_URL}/${tr}${path}` : `${IMAGEKIT_URL}${path}`
}

// ── Deletion ─────────────────────────────────────────────────
export async function deleteFromImageKit(fileId: string): Promise<void> {
  const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || _IMAGEKIT_PRIVATE_KEY_CACHED || '').trim()
  if (!fileId || !privateKey) return
  try {
    await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${Buffer.from(privateKey + ':').toString('base64')}` },
    })
  } catch {}
}

export function extractFileIdFromUrl(url: string): string | null {
  if (!url?.includes('imagekit.io')) return null
  const clean = url.replace(/\/tr:[^/]+/, '')
  const match = clean.match(/ik\.imagekit\.io\/[^/]+\/(.+)/)
  return match ? match[1] : null
}
