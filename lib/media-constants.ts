/**
 * lib/media-constants.ts
 * Shared constants for media validation — safe to import in both
 * client (browser) and server (API routes).
 * No server-only dependencies here.
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
] as const

export const IMAGE_MAX_BYTES = 7 * 1024 * 1024    // 7MB
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024  // 100MB
export const VIDEO_MAX_DURATION_SEC = 40           // 40 seconds
