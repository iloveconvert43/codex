/**
 * lib/media.ts — Client-Side Media Processing
 *
 * Image compression:
 *   - Resize to max 1920px (preserves aspect ratio)
 *   - Convert to WebP (best size/quality ratio)
 *   - Quality: 0.82 (visually lossless, ~60-70% smaller)
 *   - GIFs kept as-is (can't compress animated GIFs in canvas)
 *   - Target: 7MB max output
 *
 * Video validation:
 *   - Max 40 seconds duration
 *   - Max 100MB file size
 *   - Check MIME type
 *
 * Why browser-side compression:
 *   - Zero server load
 *   - Faster upload (smaller file)
 *   - Less R2 storage used
 *   - Free for users (no transcoding cost)
 */

export interface CompressResult {
  file: File
  originalSize: number
  compressedSize: number
  savedPercent: number
  width: number
  height: number
}

export interface VideoMeta {
  duration: number
  width: number
  height: number
  size: number
}

// ─── IMAGE COMPRESSION ─────────────────────────────────────

const IMAGE_MAX_DIMENSION = 1920  // px
const IMAGE_QUALITY = 0.82        // WebP quality
const IMAGE_MAX_OUTPUT_BYTES = 7 * 1024 * 1024  // 7MB

/**
 * Compress an image file using Canvas API.
 * Returns a WebP blob (or original GIF).
 */
export async function compressImage(file: File): Promise<CompressResult> {
  // GIFs — don't compress (kills animation)
  if (file.type === 'image/gif') {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      savedPercent: 0,
      width: 0,
      height: 0 }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      // Calculate target dimensions
      let { width, height } = img
      if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
        const ratio = Math.min(IMAGE_MAX_DIMENSION / width, IMAGE_MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      // Draw to canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // Try WebP first, fallback to JPEG
      const tryCompress = (quality: number, format: string): Promise<Blob> =>
        new Promise((res, rej) => {
          canvas.toBlob(
            (blob) => blob ? res(blob) : rej(new Error('Canvas toBlob failed')),
            format,
            quality
          )
        })

      ;(async () => {
        try {
          // Try WebP
          let blob = await tryCompress(IMAGE_QUALITY, 'image/webp')

          // If WebP not supported (Safari < 14), use JPEG
          if (blob.type !== 'image/webp') {
            blob = await tryCompress(IMAGE_QUALITY, 'image/jpeg')
          }

          // If still too large, reduce quality progressively
          let quality = IMAGE_QUALITY
          while (blob.size > IMAGE_MAX_OUTPUT_BYTES && quality > 0.5) {
            quality -= 0.1
            blob = await tryCompress(quality, blob.type)
          }

          const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
          const outputFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, `.${ext}`),
            { type: blob.type }
          )

          resolve({
            file: outputFile,
            originalSize: file.size,
            compressedSize: outputFile.size,
            savedPercent: Math.round((1 - outputFile.size / file.size) * 100),
            width,
            height })
        } catch (err) {
          reject(err)
        }
      })()
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}

// ─── VIDEO VALIDATION ───────────────────────────────────────

const VIDEO_MAX_DURATION = 40   // seconds
const VIDEO_MAX_BYTES = 100 * 1024 * 1024  // 100MB

export interface VideoValidationResult {
  ok: boolean
  error?: string
  meta?: VideoMeta
}

/**
 * Validate video: check duration + size.
 * Returns metadata if valid.
 */
export function validateVideo(file: File): Promise<VideoValidationResult> {
  return new Promise((resolve) => {
    if (file.size > VIDEO_MAX_BYTES) {
      resolve({ ok: false, error: `Video too large. Max ${VIDEO_MAX_BYTES / 1024 / 1024}MB.` })
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.onloadedmetadata = () => {
      cleanup()
      const { duration, videoWidth: width, videoHeight: height } = video

      if (duration > VIDEO_MAX_DURATION) {
        resolve({
          ok: false,
          error: `Video too long. Max ${VIDEO_MAX_DURATION} seconds (${Math.round(duration)}s detected).` })
        return
      }

      if (duration === 0 || !isFinite(duration)) {
        resolve({ ok: false, error: 'Could not read video duration.' })
        return
      }

      resolve({
        ok: true,
        meta: { duration, width, height, size: file.size } })
    }

    video.onerror = () => {
      cleanup()
      resolve({ ok: false, error: 'Invalid or corrupted video file.' })
    }

    // Timeout after 10 seconds
    setTimeout(() => {
      cleanup()
      resolve({ ok: false, error: 'Video validation timed out.' })
    }, 10000)

    video.src = objectUrl
  })
}

// ─── THUMBNAIL GENERATION ───────────────────────────────────

/**
 * Extract a thumbnail from a video at 1 second mark.
 * Returns a WebP blob.
 */
export function generateVideoThumbnail(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1)
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const MAX = 720
        let w = video.videoWidth
        let h = video.videoHeight
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h)
          w = Math.round(w * r)
          h = Math.round(h * r)
        }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl)
            if (!blob) { resolve(null); return }
            resolve(new File([blob], 'thumbnail.webp', { type: 'image/webp' }))
          },
          'image/webp',
          0.8
        )
      } catch {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
    }

    video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null) }
    video.src = objectUrl
  })
}

// ─── HELPERS ────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}
