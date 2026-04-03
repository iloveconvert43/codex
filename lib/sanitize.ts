/**
 * lib/sanitize.ts — Input sanitization to prevent XSS
 * 
 * Used on all user-generated text before storing/displaying.
 * Server-side only for DB inputs, client-side for display.
 */

/**
 * Strip dangerous HTML tags and attributes from text.
 * Keeps the text but removes script/event handlers.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+on\w+\s*=\s*["'][^"']*["'][^>]*>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|form|input|button)[^>]*>/gi, '')
    .trim()
}

/**
 * Sanitize a tag string — allow only safe characters
 */
export function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9_\u0900-\u097F\u0980-\u09FF]/g, '') // a-z, 0-9, underscore, Hindi, Bengali
    .slice(0, 30)
}

/**
 * Sanitize an array of tags
 */
export function sanitizeTags(tags: string[]): string[] {
  return tags
    .map(sanitizeTag)
    .filter(Boolean)
    .slice(0, 5)
}

/**
 * Escape HTML for safe rendering (when not using React's auto-escaping)
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
