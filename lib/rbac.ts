/**
 * lib/rbac.ts — Role-Based Access Control
 * 
 * Centralized permission checks for all user actions.
 * Used in API routes to ensure users can only access their own data.
 */
import { createRouteClient } from '@/lib/supabase-server'

export type UserRole = 'user' | 'moderator' | 'admin' | 'banned'

/**
 * Check if user owns a resource (post, comment, etc.)
 */
export async function canModify(
  supabase: ReturnType<typeof createRouteClient>,
  table: string,
  resourceId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('user_id')
    .eq('id', resourceId)
    .single()

  return data?.user_id === userId
}

/**
 * Check if user is a room moderator or admin
 */
export async function isRoomModerator(
  supabase: ReturnType<typeof createRouteClient>,
  roomId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('room_moderators')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single()

  return !!data
}

/**
 * Check if user can view a profile field based on privacy settings
 */
export function canViewField(
  privacySettings: Record<string, string>,
  field: string,
  isOwnProfile: boolean
): boolean {
  if (isOwnProfile) return true
  const setting = privacySettings?.[`show_${field}`]
  return setting === 'public'
}

/**
 * Check if user is banned
 */
export async function isUserBanned(
  supabase: ReturnType<typeof createRouteClient>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('is_banned, account_locked, locked_until')
    .eq('id', userId)
    .single()

  if (!data) return true
  if (data.is_banned) return true
  if (data.account_locked && data.locked_until) {
    return new Date(data.locked_until) > new Date()
  }
  return false
}

/**
 * Verify ownership before delete/edit operations
 * Returns error response or null if authorized
 */
export async function requireOwnership(
  supabase: ReturnType<typeof createRouteClient>,
  table: string,
  resourceId: string,
  userId: string
): Promise<{ error: string; status: number } | null> {
  const owns = await canModify(supabase, table, resourceId, userId)
  if (!owns) {
    return { error: 'You can only modify your own content', status: 403 }
  }
  return null
}
