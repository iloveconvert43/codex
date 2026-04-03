export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-cache'
import { checkRateLimit } from '@/lib/redis'
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  generateFileName,
  getFolder,
} from '@/lib/imagekit'

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const auth = await getAuthUser(req, supabase)
    if (!auth) {
      return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 })
    }

    const { data: user } = await supabase
      .from('users')
      .select('is_banned')
      .eq('id', auth.userId)
      .single()

    if (user?.is_banned) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    const rl = await checkRateLimit(`upload:${auth.userId}`, 30, 3600)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Upload limit reached. Max 30 per hour. Try again later.' }, { status: 429 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const uploadType = (form.get('uploadType') as string | null) || 'images'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)
    if (!isImage && !isVideo) {
      return NextResponse.json({ error: `File type "${file.type}" not allowed.` }, { status: 400 })
    }

    const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `File too large.` }, { status: 400 })
    }

    const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || '').trim()
    if (!privateKey) {
      return NextResponse.json({ error: 'IMAGEKIT_PRIVATE_KEY is not configured' }, { status: 500 })
    }

    const folder = getFolder(uploadType)
    const fileName = generateFileName({ type: uploadType, userId: auth.userId, mimeType: file.type })

    const upstream = new FormData()
    upstream.append('file', file)
    upstream.append('fileName', fileName)
    upstream.append('folder', folder)
    upstream.append('useUniqueFileName', 'false')
    upstream.append('tags', uploadType)

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`,
      },
      body: upstream,
      cache: 'no-store',
    })

    const text = await response.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `ImageKit upload failed (${response.status})`
      return NextResponse.json({ error: message, imagekit: data }, { status: response.status })
    }

    return NextResponse.json({
      url: data.url,
      filePath: data.filePath || `/${folder}/${fileName}`,
      fileId: data.fileId || '',
      width: data.width,
      height: data.height,
      thumbnailUrl: data.thumbnailUrl,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (err: any) {
    console.error('[upload/direct]', err)
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}
