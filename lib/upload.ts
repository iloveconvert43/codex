/**
 * lib/upload.ts — Client-side ImageKit upload
 *
 * Direct upload flow (Facebook-style):
 *   Browser → ImageKit CDN  (zero server bandwidth)
 *   Progress tracking via XHR
 *
 * Usage:
 *   const { url } = await uploadMedia(file, 'images')
 *   const { url } = await uploadMedia(file, 'avatars', (p) => setProgress(p.percent))
 */
'use client'

import { api, getAuthHeader } from './api'
import { IMAGEKIT_URL, getOptimizedUrl as _getOptUrl } from './imagekit'

// ── Types ──────────────────────────────────────────────────
export interface UploadProgress {
  percent: number
  loaded:  number
  total:   number
}

export interface UploadResult {
  url:      string   // Final CDN URL (ready to use)
  filePath: string   // Path for deletion
  fileId:   string   // ImageKit fileId for deletion
  width?:   number
  height?:  number
  thumbnailUrl?: string
}

export type UploadType = 'images' | 'videos' | 'avatars' | 'covers'

// ── Ensure auth is available ─────────────────────────────────
// Uses the centralized getAuthHeader from api.ts which handles JWT caching
async function ensureAuth(): Promise<void> {
  const headers = await getAuthHeader()
  if (!headers.Authorization) {
    throw new Error('Please sign in to upload files')
  }
}

// ── Main upload function ───────────────────────────────────
/**
 * Upload a file directly to ImageKit CDN
 * Server only generates the auth signature — file never touches Vercel
 * Includes retry logic for resilience
 */
export async function uploadToImageKit(
  file: File,
  type: UploadType = 'images',
  onProgress?: (p: UploadProgress) => void
): Promise<UploadResult> {
  if (!file) throw new Error('No file provided')

  // Ensure we have auth before starting (uses centralized JWT cache from api.ts)
  await ensureAuth()

  // Retry wrapper — 1 retry on failure
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await _doUpload(file, type, onProgress)
    } catch (err: any) {
      lastError = err
      // Don't retry on validation or rate limit errors
      if (err.status === 400 || err.status === 403 || err.status === 429) {
        throw err
      }
      // On 401: api.ts handles token refresh internally, just retry
      if (err.status === 401 && attempt === 0) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      if (err.status === 401) throw err
      // Wait 1s before retry for other errors
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
  throw lastError || new Error('Upload failed after retries')
}

async function _doUpload(
  file: File,
  type: UploadType,
  onProgress?: (p: UploadProgress) => void
): Promise<UploadResult> {
  // Upload via our server route to avoid client-side signature mismatches
  const form = new FormData()
  form.append('file', file)
  form.append('uploadType', type)

  const headers = await getAuthHeader()
  const result = await xhrUpload('/api/upload/direct', form, onProgress, headers.Authorization || '')

  return {
    url:      result.url,
    filePath: result.filePath ?? '',
    fileId:   result.fileId   ?? '',
    width:    result.width,
    height:   result.height,
    thumbnailUrl: result.thumbnailUrl,
  }
}

// ── XHR with progress ──────────────────────────────────────
function xhrUpload(
  endpoint: string,
  form: FormData,
  onProgress?: (p: UploadProgress) => void,
  authHeader?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.timeout = 120_000  // 2 min

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded:  e.loaded,
            total:   e.total,
          })
        }
      }
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data)
        } else {
          const msg = data?.message || data?.error || `Upload failed (${xhr.status})`
          reject(new Error(msg))
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 100)}`))
      }
    }

    xhr.onerror   = () => reject(new Error('Network error during upload. Check your internet connection.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out after 2 minutes. Try a smaller file.'))

    xhr.open('POST', endpoint)
    if (authHeader) xhr.setRequestHeader('Authorization', authHeader)
    xhr.send(form)
  })
}

// ── URL optimizer ──────────────────────────────────────────
/**
 * Get an optimized ImageKit URL for the given display size
 * Non-ImageKit URLs (Supabase, etc.) are returned unchanged
 */
/** Get optimized ImageKit URL - delegates to imagekit.ts */
export function getImageKitUrl(
  url: string | null | undefined,
  opts: { w?: number; h?: number; q?: number; fit?: 'cover' | 'contain'; context?: string } = {}
): string {
  if (!url) return ''
  if (!url.includes('imagekit.io')) return url

  // Use named context if provided
  if (opts.context) return _getOptUrl(url, opts.context as any)

  // Otherwise build custom transform
  const t: string[] = ['f-webp', 'pr-true']
  if (opts.w)               t.push(`w-${opts.w}`)
  if (opts.h)               t.push(`h-${opts.h}`)
  if (opts.q)               t.push(`q-${opts.q}`)
  if (opts.fit === 'cover') t.push('c-at_max')

  const clean = url.replace(/\/tr:[^/]+/, '')
  const path  = clean.startsWith(IMAGEKIT_URL)
    ? clean.slice(IMAGEKIT_URL.length)
    : `/${clean.split('/').slice(4).join('/')}`

  return `${IMAGEKIT_URL}/tr:${t.join(',')}${path}`
}

/** Re-export for convenience */
export { _getOptUrl as getOptimizedUrl }
