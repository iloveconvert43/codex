/**
 * lib/r2.ts — Cloudflare R2 Server-Side Client
 *
 * Architecture (Presigned URL flow):
 *   Client → POST /api/upload/presign → get signed URL
 *   Client → PUT directly to R2 (no server bandwidth!)
 *   Client → saves R2 CDN URL in post via /api/posts
 *
 * Why presigned URLs:
 *   - Upload goes directly from browser → Cloudflare (no Vercel bandwidth)
 *   - Server never touches the file bytes
 *   - Vercel free plan stays safe
 *   - R2 free plan: 10GB storage, 1M Class A ops/month
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.warn('⚠️  CLOUDFLARE_ACCOUNT_ID not set — R2 uploads will fail')
}

// R2 is S3-compatible — use AWS SDK with Cloudflare endpoint
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' } })

const BUCKET = process.env.R2_BUCKET_NAME || 'tryhushly-media'
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

// Re-export from shared constants
export { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_SEC } from '@/lib/media-constants'

/**
 * Generate a presigned PUT URL for direct browser upload.
 * URL expires in 5 minutes.
 */
export async function generatePresignedUploadUrl(params: {
  key: string
  contentType: string
  contentLength: number
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
    // Cache control for CDN
    CacheControl: 'public, max-age=31536000, immutable',
    // Security: mark as attachment so direct URL doesn't execute scripts
    ContentDisposition: 'inline' })

  const url = await getSignedUrl(r2Client, command, { expiresIn: 300 })
  return url
}

/**
 * Convert R2 storage key to public CDN URL
 * Example: images/user123/1234567890.webp → https://pub-xxx.r2.dev/images/user123/1234567890.webp
 */
export function getPublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`
}

/**
 * Generate a unique storage key for a file
 * Format: {type}/{userId}/{timestamp}-{random}.{ext}
 */
export function generateStorageKey(params: {
  type: 'images' | 'videos'
  userId: string
  mimeType: string
}): string {
  const ext = mimeTypeToExt(params.mimeType)
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `${params.type}/${params.userId}/${timestamp}-${random}.${ext}`
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov' }
  return map[mimeType] || 'bin'
}

/**
 * Delete a file from R2 (for post deletion)
 */
export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  await r2Client.send(command)
}

/**
 * Extract storage key from a public CDN URL
 * Used when deleting posts to clean up R2
 */
export function extractKeyFromUrl(url: string): string | null {
  if (!PUBLIC_URL || !url.startsWith(PUBLIC_URL)) return null
  return url.replace(`${PUBLIC_URL}/`, '')
}
