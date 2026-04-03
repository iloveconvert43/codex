// ============================================================
// tryHushly — Complete Type Definitions
// ============================================================

export type ReactionType = 'interesting' | 'funny' | 'deep' | 'curious'
export type CommentReactionType = 'like' | 'dislike'
export type FeedFilter = 'global' | 'nearby' | 'city' | 'friends' | 'room'
export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'
export type UserLevel = 'curious_newcomer' | 'story_seeker' | 'mystery_maker' | 'hushly_legend'
export type PrivacyLevel = 'public' | 'private'

export type NotificationType =
  | 'new_reaction' | 'new_comment' | 'new_follower' | 'new_message'
  | 'mystery_revealed' | 'challenge_reminder' | 'streak_milestone' | 'badge_awarded'
  | 'new_anonymous_question' | 'level_up' | 'reshare_received'
  | 'follow_request' | 'follow_accepted' | 'tagged_in_post' | 'message_request'
  | 'story_mention' | 'comment_mention'

// Privacy settings for profile fields
export interface UserPrivacySettings {
  show_gender: PrivacyLevel
  show_dob: PrivacyLevel
  show_phone: PrivacyLevel
  show_nationality: PrivacyLevel
  show_address: PrivacyLevel
}

// Level configuration
export const LEVEL_CONFIG: Record<UserLevel, { label: string; emoji: string; minPoints: number; color: string }> = {
  curious_newcomer: { label: 'Curious Newcomer', emoji: '🌱', minPoints: 0,    color: 'text-accent-green' },
  story_seeker:     { label: 'Story Seeker',     emoji: '🔍', minPoints: 101,  color: 'text-blue-400' },
  mystery_maker:    { label: 'Mystery Maker',    emoji: '🎭', minPoints: 501,  color: 'text-primary' },
  hushly_legend:    { label: 'Hushly Legend',    emoji: '👑', minPoints: 2001, color: 'text-accent-yellow' } }

// Points config — how many points per action
export const POINTS_CONFIG = {
  post_created:       10,
  media_post:         15,
  mystery_post:       20,
  reaction_received:  2,
  mystery_revealed:   5,
  comment_posted:     3,
  comment_liked:      1,
  daily_challenge:    25,
  streak_7:           50,
  streak_30:          150,
  streak_100:         500,
  reshare_received:   8,
  question_answered:  15,
  first_post_day:     10 } as const

// ── User ───────────────────────────────────────────────────
export interface User {
  id: string
  auth_id: string
  full_name: string | null
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  gender: Gender | null
  dob: string | null
  phone: string | null
  nationality: string | null
  address: string | null
  privacy_settings: UserPrivacySettings
  latitude: number | null
  longitude: number | null
  city: string | null
  country: string | null
  neighborhood_id: string | null
  scope: 'global' | 'nearby' | 'city'
  is_anonymous: boolean
  is_verified: boolean
  email_verified: boolean
  phone_verified: boolean
  is_banned: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ── Post ───────────────────────────────────────────────────
export interface Post {
  id: string
  user_id: string
  content: string | null
  image_url: string | null
  video_url: string | null
  video_thumbnail_url: string | null
  gif_url?: string | null
  scope?: 'global' | 'nearby' | 'city' | null
  is_anonymous: boolean
  is_mystery: boolean
  is_sensitive?: boolean
  latitude: number | null
  longitude: number | null
  city: string | null
  tags: string[]
  reveal_count: number
  view_count: number
  reshare_count?: number
  reshared_from_id?: string | null
  reshare_comment?: string | null
  room_id?: string | null
  neighborhood_id?: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  // Feeling/Activity
  feeling?: string | null
  feeling_emoji?: string | null
  activity?: string | null
  activity_emoji?: string | null
  activity_detail?: string | null
  location_name?: string | null
  is_life_event?: boolean
  life_event_type?: string | null
  life_event_emoji?: string | null
  // Joined
  user?: User | null
  room?: TopicRoom | null
  reshared_from?: Post | null
  reaction_counts?: Record<ReactionType, number>
  comment_count?: number
  user_reaction?: ReactionType | null
  has_revealed?: boolean
  distance_km?: number
  latest_comment?: PostCommentPreview | null
}

// ── Comment ────────────────────────────────────────────────
export interface Comment {
  id: string
  post_id: string
  user_id: string
  parent_id: string | null
  content: string
  scope: 'global' | 'nearby' | 'city'
  is_anonymous: boolean
  is_deleted: boolean
  like_count: number
  dislike_count?: number
  user_reaction?: CommentReactionType | null
  image_url?: string | null
  video_url?: string | null
  video_thumbnail_url?: string | null
  gif_url?: string | null
  mentions: string[]
  created_at: string
  user?: User | null
  replies?: Comment[]
  user_liked?: boolean
}

export interface PostCommentPreview {
  id: string
  post_id: string
  user_id: string
  parent_id?: string | null
  content: string
  created_at: string
  is_anonymous?: boolean
  image_url?: string | null
  video_url?: string | null
  video_thumbnail_url?: string | null
  gif_url?: string | null
  user?: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'is_verified'> | null
}

// ── Story ──────────────────────────────────────────────────
export interface Story {
  id: string
  user_id: string
  content: string | null
  image_url: string | null
  video_url: string | null
  bg_color: string
  scope: 'global' | 'nearby' | 'city'
  is_anonymous: boolean
  is_mystery: boolean
  mystery_reveal_threshold: number
  view_count: number
  expires_at: string
  created_at: string
  user?: User | null
  has_viewed?: boolean
}

// ── Points / Gamification ──────────────────────────────────
export interface UserPoints {
  user_id: string
  total_points: number
  weekly_points: number
  level: UserLevel
  week_start: string
}

// ── Topic Rooms ────────────────────────────────────────────
export interface TopicRoom {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string
  post_count: number
  member_count: number
  is_featured: boolean
  is_private: boolean
  created_by: string | null
  rules: string | null
  banner_url: string | null
  invite_code: string | null
  is_member?: boolean
}

// ── Anonymous Q&A ──────────────────────────────────────────
export interface AnonymousQuestion {
  id: string
  target_user_id: string
  question_text: string
  is_answered: boolean
  answer_post_id: string | null
  created_at: string
}

// ── Neighborhood ───────────────────────────────────────────
export interface Neighborhood {
  id: string
  name: string
  city: string
  slug: string
  latitude: number | null
  longitude: number | null
  radius_km: number
  member_count: number
}

// ── Other existing types ───────────────────────────────────
export interface DailyChallenge {
  id: string
  title: string
  description: string
  emoji: string
  challenge_date: string
  is_active: boolean
  created_at: string
  participant_count?: number
  user_has_participated?: boolean
}

export interface UserStreak {
  user_id: string
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  total_posts: number
}

export interface Notification {
  id: string
  user_id: string
  actor_id: string | null
  type: NotificationType | string
  post_id: string | null
  comment_id: string | null
  message: string | null
  is_read: boolean
  grouped_count: number
  created_at: string
  actor?: User | null
}

export interface DirectMessage {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  is_deleted: boolean
  created_at: string
  sender?: User | null
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedFeed {
  data: Post[]
  hasMore: boolean
  nextCursor: string | null
}

export interface SignupFormData {
  full_name: string
  username: string
  email: string
  phone: string
  password: string
  gender: Gender
  dob: string
  nationality: string
}
