/**
 * lib/validation/schemas.ts — Zod schemas for all API inputs
 * Used in both client (form validation) and server (API validation)
 */
import { z } from 'zod'

// ── Auth ─────────────────────────────────────────────────
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone required').max(256),
  password: z.string().min(1, 'Password required').max(128) })

export const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be 2+ characters').max(80).trim(),
  identifier: z.string().min(5).max(256),
  password: z.string()
    .min(8, 'Password must be 8+ characters')
    .max(128)
    .refine(pw => /[A-Za-z]/.test(pw), 'Password must contain letters'),
  dob: z.string().refine(d => {
    const age = Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000))
    return age >= 13 && age <= 120
  }, 'Must be 13+ years old'),
  gender: z.enum(['male','female','non_binary','prefer_not_to_say']).optional() })

// ── Posts ─────────────────────────────────────────────────
export const createPostSchema = z.object({
  content: z.string().max(5000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  video_url: z.string().url().nullable().optional(),
  video_thumbnail_url: z.string().url().nullable().optional(),
  is_anonymous: z.boolean().default(false),
  is_mystery: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(30)).max(5).default([]) }).refine(
  d => !!(d.content?.trim() || d.image_url || d.video_url),
  { message: 'Post must have text, image, or video' }
)

// ── Comments ─────────────────────────────────────────────
export const createCommentSchema = z.object({
  content: z.string().min(1).max(500).trim(),
  parent_id: z.string().uuid().nullable().optional(),
  is_anonymous: z.boolean().default(false) })

// ── Messages ──────────────────────────────────────────────
export const sendMessageSchema = z.object({
  to_user_id: z.string().uuid('Invalid user ID'),
  content: z.string().min(0).max(1000).trim().default(''),
  image_url: z.string().url().optional().nullable(),
}).refine(d => d.content.length > 0 || !!d.image_url, {
  message: 'Message must have content or an image'
})

// ── Reports ──────────────────────────────────────────────
export const reportSchema = z.object({
  post_id: z.string().uuid(),
  reason: z.enum(['spam','harassment','hate_speech','inappropriate_content','misinformation','other']) })

// ── Profile update ────────────────────────────────────────
export const updateProfileSchema = z.object({
  full_name:    z.string().min(2).max(80).trim().optional(),
  display_name: z.string().min(1).max(50).trim().nullable().optional(),
  username:     z.string()
    .regex(/^[a-z0-9_]{3,30}$/, 'Username: 3-30 chars, letters/numbers/underscore')
    .nullable().optional(),
  bio:          z.string().max(160).trim().nullable().optional(),
  avatar_url:   z.string().url().nullable().optional(),
  cover_url:    z.string().url().nullable().optional(),
  phone:        z.string().max(20).nullable().optional(),
  gender:       z.enum(['male','female','non_binary','prefer_not_to_say']).nullable().optional(),
  dob:          z.string().nullable().optional(),
  nationality:  z.string().max(50).nullable().optional(),
  address:      z.string().max(200).nullable().optional(),
  city:         z.string().max(100).nullable().optional(),
  hometown:     z.string().max(100).nullable().optional(),
  pronouns:     z.string().max(30).nullable().optional(),
  relationship_status: z.enum(['single','in_relationship','engaged','married','complicated','open','widowed','separated','divorced']).nullable().optional(),
  languages:    z.array(z.string().max(30)).max(10).nullable().optional(),
  latitude:     z.number().min(-90).max(90).nullable().optional(),
  longitude:    z.number().min(-180).max(180).nullable().optional(),
  is_private:   z.boolean().optional(),
  pinned_detail: z.string().max(100).nullable().optional(),
  privacy_settings: z.object({
    show_gender:       z.enum(['public','private']),
    show_dob:          z.enum(['public','private']),
    show_phone:        z.enum(['public','private']),
    show_nationality:  z.enum(['public','private']),
    show_address:      z.enum(['public','private']) }).optional() })

// ── Feed ──────────────────────────────────────────────────
export const feedQuerySchema = z.object({
  filter: z.enum(['global','nearby','city','friends','room']).default('global'),
  cursor: z.string().optional(),   // ISO timestamp for cursor pagination
  limit: z.coerce.number().min(1).max(30).default(15),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional() })

// ── Upload ────────────────────────────────────────────────
export const presignSchema = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().max(150 * 1024 * 1024), // 150MB max
  mediaType: z.enum(['image','video']) })

// Validation helper
export function validate<T>(schema: z.ZodSchema<T>, data: unknown):
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, data: result.data }
  const first = result.error.issues[0]
  return { success: false, error: first?.message || 'Validation failed' }
}

// ── Location update ───────────────────────────────────────────
export const locationUpdateSchema = z.object({
  latitude:   z.number().min(-90).max(90),
  longitude:  z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(10000).optional(),
  city:       z.string().max(100).optional(),
  locality:   z.string().max(100).optional() })
