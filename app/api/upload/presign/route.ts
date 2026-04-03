export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/upload/presign
 *
 * Issues a short-lived ImageKit auth token so the browser can
 * upload directly to the CDN (zero Vercel bandwidth).
 *
 * Flow:
 *   Browser → POST /api/upload/presign  → { token, expire, signature, publicKey, fileName, folder }
 *   Browser → POST upload.imagekit.io   → CDN URL
 *   Browser → saves URL via /api/posts or /api/users/profile
 *
 * Security:
 *   - Requires valid JWT session
 *   - HMAC-SHA1 signature expires in 10 min
 *   - Rate limited: 30 uploads / hour / user  (via Redis)
 *   - File type + size validated server-side
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-cache'
import { checkRateLimit } from '@/lib/redis'
import {
  signImageKitUpload,
  generateFileName,
  getFolder,
  IMAGEKIT_URL,
  IMAGEKIT_PUBLIC_KEY,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
} from '@/lib/imagekit'

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────
    const supabase = createAdminClient()
    const auth = await getAuthUser(req, supabase)
    if (!auth) {
      return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 })
    }

    // ── Account check (ban) ─────────────────────────────────
    const { data: user } = await supabase
      .from('users').select('is_banned').eq('id', auth.userId).single()
    if (user?.is_banned) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    // ── Rate limit (Redis) ──────────────────────────────────
    const rl = await checkRateLimit(`upload:${auth.userId}`, 30, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Upload limit reached. Max 30 per hour. Try again later.` },
        { status: 429 }
      )
    }

    // ── Parse body ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const {
      contentType   = '',
      contentLength = 0,
      uploadType    = 'images',
    } = body as {
      contentType:   string
      contentLength: number
      uploadType:    'images' | 'videos' | 'avatars' | 'covers'
    }

    // ── Validate file type ──────────────────────────────────
    const isImage = ALLOWED_IMAGE_TYPES.includes(contentType)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType)
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: `File type "${contentType}" not allowed. Use JPG, PNG, WebP, GIF, MP4, WebM.` },
        { status: 400 }
      )
    }

    // ── Validate file size ──────────────────────────────────
    const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
    if (contentLength > maxBytes) {
      const maxMB = (maxBytes / 1024 / 1024).toFixed(0)
      return NextResponse.json(
        { error: `File too large. Max ${maxMB}MB for ${isImage ? 'images' : 'videos'}.` },
        { status: 400 }
      )
    }

    // ── Generate ImageKit auth ──────────────────────────────
    const nodeCrypto = require('crypto')
    const token    = nodeCrypto.randomUUID()
    const expire   = Math.floor(Date.now() / 1000) + 600  // 10 min
    const signature = signImageKitUpload(token, expire)

    if (process.env.NODE_ENV !== 'production') {
      console.log('[presign] Generated:', {
        token: token.slice(0, 12) + '...',
        expire,
      })
    }

    // ── File path ───────────────────────────────────────────
    // folder = 'posts' (relative, no leading slash)
    // IMAGEKIT_URL = 'https://ik.imagekit.io/tryhushly'
    // publicUrl  = 'https://ik.imagekit.io/tryhushly/posts/filename.jpg'
    const folder   = getFolder(uploadType)
    const fileName = generateFileName({ type: uploadType, userId: auth.userId, mimeType: contentType })
    const filePath = `/${folder}/${fileName}`
    const publicUrl = `${IMAGEKIT_URL}/${folder}/${fileName}`

    return NextResponse.json({
      // ImageKit upload fields
      token,
      expire,
      signature,
      publicKey: IMAGEKIT_PUBLIC_KEY,

      // File destination
      fileName,
      folder,

      // Final URL (available after upload completes)
      publicUrl,
      filePath,
    })
  } catch (err: any) {
    console.error('[presign]', err.message)
    return NextResponse.json(
      { error: 'Failed to generate upload credentials' },
      { status: 500 }
    )
  }
}
