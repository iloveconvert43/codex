'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, MapPin, Smile, Users, Film, Image as ImageIcon, Gift, Star, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLocation } from '@/hooks/useLocation'
import { useMediaUpload } from '@/hooks/useMediaUpload'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import Avatar from '@/components/ui/Avatar'
import PostScopeSelector, { type PostScope } from '@/components/feed/PostScopeSelector'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import useSWR from 'swr'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import type { Post } from '@/types'

const DRAFT_KEY = 'hushly-post-draft-v2'
const FEED_REFRESH_KEY = 'hushly-feed-refresh'
const PENDING_POST_KEY = 'hushly-pending-post'
const DYNAMIC_CACHE_NAMES = ['feed-cache', 'apis', 'pages', 'pages-rsc', 'pages-rsc-prefetch', 'start-url', 'next-data']

async function clearDynamicCaches() {
  if (typeof window === 'undefined' || !('caches' in window)) return
  try {
    const cacheKeys = await caches.keys()
    await Promise.all(
      cacheKeys
        .filter((key) => DYNAMIC_CACHE_NAMES.some((name) => key.includes(name)))
        .map((key) => caches.delete(key))
    )
  } catch {
    // Best effort only — posting should still succeed even if cache cleanup fails.
  }
}

function buildPendingPost(createdPost: any, profile: any): Post {
  return {
    ...createdPost,
    tags: Array.isArray(createdPost?.tags) ? createdPost.tags : [],
    reaction_counts: createdPost?.reaction_counts || { interesting: 0, funny: 0, deep: 0, curious: 0 },
    comment_count: createdPost?.comment_count ?? 0,
    reshare_count: createdPost?.reshare_count ?? 0,
    reveal_count: createdPost?.reveal_count ?? 0,
    view_count: createdPost?.view_count ?? 0,
    has_revealed: createdPost?.has_revealed ?? false,
    is_deleted: createdPost?.is_deleted ?? false,
    user: createdPost?.user || (profile ? {
      id: profile.id,
      full_name: profile.full_name ?? null,
      username: profile.username ?? null,
      display_name: profile.display_name ?? profile.full_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      is_verified: !!profile.is_verified,
      city: profile.city ?? null,
    } : null),
  } as Post
}

// ── FEELINGS ──────────────────────────────────────────────────
const FEELINGS = [
  { label: 'Happy', emoji: '😊' },
  { label: 'Excited', emoji: '🤩' },
  { label: 'Loved', emoji: '🥰' },
  { label: 'Blessed', emoji: '🙏' },
  { label: 'Grateful', emoji: '💙' },
  { label: 'Proud', emoji: '💪' },
  { label: 'Amazing', emoji: '✨' },
  { label: 'Motivated', emoji: '🔥' },
  { label: 'Sad', emoji: '😢' },
  { label: 'Tired', emoji: '😴' },
  { label: 'Confused', emoji: '😕' },
  { label: 'Angry', emoji: '😤' },
  { label: 'Bored', emoji: '🥱' },
  { label: 'Anxious', emoji: '😰' },
  { label: 'Nostalgic', emoji: '🥲' },
  { label: 'Silly', emoji: '🤪' },
  { label: 'Hungry', emoji: '🍜' },
  { label: 'Adventurous', emoji: '🧭' },
]

// ── ACTIVITIES ─────────────────────────────────────────────────
const ACTIVITIES = [
  { label: 'Watching',    emoji: '📺', placeholder: 'What are you watching?' },
  { label: 'Listening to',emoji: '🎵', placeholder: 'What are you listening to?' },
  { label: 'Reading',     emoji: '📖', placeholder: 'What are you reading?' },
  { label: 'Playing',     emoji: '🎮', placeholder: 'What are you playing?' },
  { label: 'Eating',      emoji: '🍽️', placeholder: 'What are you eating?' },
  { label: 'Drinking',    emoji: '☕', placeholder: 'What are you drinking?' },
  { label: 'Travelling',  emoji: '✈️', placeholder: 'Where are you going?' },
  { label: 'Working on',  emoji: '💻', placeholder: 'What are you working on?' },
  { label: 'Celebrating', emoji: '🎉', placeholder: 'What are you celebrating?' },
  { label: 'Thinking about', emoji: '💭', placeholder: 'What are you thinking about?' },
]

// ── LIFE EVENTS ───────────────────────────────────────────────
const LIFE_EVENTS = [
  { type: 'new_job',       emoji: '💼', label: 'Started a new job' },
  { type: 'new_education', emoji: '🎓', label: 'Started education' },
  { type: 'relationship',  emoji: '💑', label: 'In a relationship' },
  { type: 'engaged',       emoji: '💍', label: 'Got engaged' },
  { type: 'married',       emoji: '👰', label: 'Got married' },
  { type: 'new_home',      emoji: '🏠', label: 'Moved to a new home' },
  { type: 'new_city',      emoji: '🌆', label: 'Moved to a new city' },
  { type: 'new_baby',      emoji: '🍼', label: 'New baby arrival' },
  { type: 'graduation',    emoji: '🎓', label: 'Graduation' },
  { type: 'birthday',      emoji: '🎂', label: 'Birthday' },
  { type: 'lost_loved_one',emoji: '🕊️', label: 'Lost a loved one' },
  { type: 'health',        emoji: '❤️‍🩹', label: 'Health update' },
  { type: 'achievement',   emoji: '🏆', label: 'Personal achievement' },
  { type: 'travel',        emoji: '🌍', label: 'Travel milestone' },
]

type PostStep = 'compose' | 'feeling' | 'activity' | 'tag_people' | 'location' | 'life_event'

export default function CreatePage() {
  const router = useRouter()
  const { profile, isLoggedIn } = useAuth()
  const { lat, lng, area, city: locCity, requestLocation, granted: locationGranted } = useLocation()
  const { upload: uploadMedia } = useMediaUpload()

  // ── State ─────────────────────────────────────────────────
  const [step, setStep] = useState<PostStep>('compose')
  const [content, setContent] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) || '' } catch { return '' }
  })
  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search) : null
  const urlScope = searchParams?.get('scope') as PostScope | null
  const [postScope, setPostScope] = useState<PostScope>(
    urlScope && ['global','nearby','city'].includes(urlScope) ? urlScope : 'global'
  )
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isMystery, setIsMystery] = useState(false)
  const [isSensitive, setIsSensitive] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Post enrichment state
  const [feeling, setFeeling] = useState<{ label: string; emoji: string } | null>(null)
  const [activity, setActivity] = useState<typeof ACTIVITIES[0] | null>(null)
  const [activityDetail, setActivityDetail] = useState('')
  const [locationName, setLocationName] = useState('')
  const [useCurrentLocation, setUseCurrentLocation] = useState(false)
  const [taggedUsers, setTaggedUsers] = useState<any[]>([])
  const [lifeEvent, setLifeEvent] = useState<typeof LIFE_EVENTS[0] | null>(null)
  const [lifeEventPartners, setLifeEventPartners] = useState<any[]>([])  // tagged "with whom"

  // Events that support "with whom" tagging
  const SOCIAL_EVENTS = ['relationship','engaged','married','new_baby','new_job','new_education','graduation','birthday']

  // Media
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [gifUrl, setGifUrl] = useState('')
  const [gifSearch, setGifSearch] = useState('')
  const [showGifSearch, setShowGifSearch] = useState(false)
  const [showVideoTrim, setShowVideoTrim] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tag people search
  const [tagSearch, setTagSearch] = useState('')
  const { data: tagSearchData } = useSWR(
    tagSearch.length >= 2 ? `/api/search?q=${encodeURIComponent(tagSearch)}&type=people&limit=10` : null,
    fetcher
  )
  const searchedPeople: any[] = (tagSearchData as any)?.data?.people ?? []

  // Draft autosave
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (content.trim()) localStorage.setItem(DRAFT_KEY, content)
        else localStorage.removeItem(DRAFT_KEY)
      } catch {}
    }, 600)
    return () => clearTimeout(t)
  }, [content])

  // Location display
  useEffect(() => {
    if (useCurrentLocation && (area || locCity)) {
      setLocationName(area || locCity || '')
    }
  }, [useCurrentLocation, area, locCity])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const MAX_IMAGE_MB = 10
    const MAX_VIDEO_MB = 100
    const validFiles: File[] = []

    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      const maxMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`${file.name} is too large (max ${maxMb}MB)`)
        continue
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast.error(`${file.name}: only images and videos supported`)
        continue
      }
      validFiles.push(file)
    }

    if (!validFiles.length) { e.target.value = ''; return }

    const newPreviews = validFiles.map(f => URL.createObjectURL(f))
    setMediaFiles(prev => [...prev, ...validFiles].slice(0, 10))
    setMediaPreviews(prev => [...prev, ...newPreviews].slice(0, 10))
    e.target.value = ''
  }

  function removeMedia(idx: number) {
    // Revoke object URL to free memory
    if (mediaPreviews[idx]) URL.revokeObjectURL(mediaPreviews[idx])
    setMediaFiles(prev => prev.filter((_, i) => i !== idx))
    setMediaPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function buildStatusLine() {
    const parts: string[] = []
    if (feeling) parts.push(`feeling ${feeling.emoji} ${feeling.label}`)
    if (activity && activityDetail) parts.push(`${activity.emoji} ${activity.label} ${activityDetail}`)
    else if (activity) parts.push(`${activity.emoji} ${activity.label}`)
    if (locationName) parts.push(`📍 ${locationName}`)
    if (taggedUsers.length) parts.push(`— with ${taggedUsers.map(u => u.display_name || u.username).join(', ')}`)
    if (lifeEvent) {
      const withNames = lifeEventPartners.map(u => u.display_name || u.username).join(' & ')
      parts.push(`${lifeEvent.emoji} ${lifeEvent.label}${withNames ? ' with ' + withNames : ''}`)
    }
    return parts.length > 0 ? parts.join(' · ') : ''
  }

  const hasStructuredPost = Boolean(feeling || activity || locationName || lifeEvent)
  const hasMediaAttachment = mediaFiles.length > 0 || Boolean(gifUrl)
  const canSubmitPost = Boolean(content.trim() || hasMediaAttachment || hasStructuredPost)

  async function handleSubmit() {
    if (!canSubmitPost) {
      toast.error('Add text, media, or an activity first!')
      return
    }
    // Validate nearby scope has coordinates
    if (postScope === 'nearby' && (!lat || !lng)) {
      toast.error('Enable location to post nearby')
      requestLocation()
      return
    }
    // Clear tagged users if posting anonymously (privacy)
    if (isAnonymous && taggedUsers.length > 0) {
      toast.error('Cannot tag people in an anonymous post')
      return
    }
    setIsSubmitting(true)
    try {
      let image_url: string | null = null
      let video_url: string | null = null

      // Upload media files — all of them using the shared stable upload hook
      const uploadedImageUrls: string[] = []
      let uploadedVideoUrl: string | null = null

      for (const file of mediaFiles) {
        const uploadResult = await uploadMedia(file)
        if (!uploadResult?.url) {
          toast.error('Upload failed. Please try again.')
          setIsSubmitting(false)
          return
        }
        if (uploadResult.mediaType === 'video') {
          uploadedVideoUrl = uploadResult.url
          break
        } else {
          uploadedImageUrls.push(uploadResult.url)
        }
      }
      image_url = uploadedImageUrls[0] ?? null
      video_url = uploadedVideoUrl

      const validTags = tags.filter(t => t.length >= 2 && t.length <= 30)

      const created = await api.post<{ data: Post }>('/api/posts', {
        content: content.trim(),
        image_url, video_url,
        gif_url: gifUrl || null,
        is_anonymous: isAnonymous,
        is_mystery: isMystery,
        is_sensitive: isSensitive,
        tags: validTags,
        scope: postScope,
        latitude: postScope === 'nearby' && lat ? lat : undefined,
        longitude: postScope === 'nearby' && lng ? lng : undefined,
        city: postScope === 'city' ? (locCity || undefined) : undefined,
        // Enrichment
        feeling: feeling?.label || null,
        feeling_emoji: feeling?.emoji || null,
        activity: activity?.label || null,
        activity_emoji: activity?.emoji || null,
        activity_detail: activityDetail || null,
        location_name: locationName || null,
        is_life_event: !!lifeEvent,
        life_event_type: lifeEvent?.type || null,
        life_event_emoji: lifeEvent?.emoji || null,
        tagged_user_ids: [...taggedUsers.map(u => u.id), ...lifeEventPartners.map(u => u.id)]
          .filter((v, i, a) => a.indexOf(v) === i) }, { requireAuth: true })

      localStorage.removeItem(DRAFT_KEY)
      const refreshNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      try {
        sessionStorage.setItem(FEED_REFRESH_KEY, refreshNonce)
        if (created?.data) {
          sessionStorage.setItem(PENDING_POST_KEY, JSON.stringify({
            post: buildPendingPost(created.data, profile),
            storedAt: Date.now(),
          }))
        }
      } catch {}
      await clearDynamicCaches()
      toast.success('Posted! 🎉')
      // Force a unique navigation target so stale page caches cannot win after posting.
      window.location.replace(`/?posted=${encodeURIComponent(refreshNonce)}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isLoggedIn) {
    router.replace('/login')
    return null
  }

  const statusLine = buildStatusLine()
  const charCount = content.length
  const charMax = 5000

  // ── STEP: Feeling picker ───────────────────────────────────
  if (step === 'feeling') {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('compose')} className="text-text-muted hover:text-text"><X size={20} /></button>
          <h2 className="font-bold">How are you feeling?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {FEELINGS.map(f => (
            <button key={f.label}
              onClick={() => { setFeeling(f); setActivity(null); setStep('compose') }}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left',
                feeling?.label === f.label
                  ? 'border-primary bg-primary-muted'
                  : 'border-border hover:border-border-active'
              )}>
              <span className="text-2xl">{f.emoji}</span>
              <span className="text-sm font-semibold">{f.label}</span>
            </button>
          ))}
        </div>
        {feeling && (
          <div className="px-4 pb-6">
            <button onClick={() => { setFeeling(null); setStep('compose') }}
              className="w-full py-3 rounded-xl border border-accent-red/30 text-accent-red text-sm">
              Remove feeling
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── STEP: Activity picker ──────────────────────────────────
  if (step === 'activity') {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('compose')} className="text-text-muted hover:text-text"><X size={20} /></button>
          <h2 className="font-bold">What are you doing?</h2>
        </div>
        {activity && (
          <div className="px-4 py-2 border-b border-border">
            <button onClick={() => { setActivity(null); setActivityDetail(''); setStep('compose') }}
              className="text-xs text-accent-red font-semibold flex items-center gap-1">
              <X size={12} /> Remove: {activity.emoji} {activity.label}
            </button>
          </div>
        )}
        <div className="p-4 space-y-2">
          {ACTIVITIES.map(a => (
            <button key={a.label}
              onClick={() => { setActivity(a); setActivityDetail(''); setFeeling(null); setStep('compose') }}
              className={cn(
                'flex items-center gap-3 w-full p-3.5 rounded-2xl border transition-all text-left',
                activity?.label === a.label
                  ? 'border-primary bg-primary-muted'
                  : 'border-border hover:border-border-active'
              )}>
              <span className="text-2xl">{a.emoji}</span>
              <span className="text-sm font-semibold">{a.label}…</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── STEP: Tag people ───────────────────────────────────────
  if (step === 'tag_people') {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('compose')} className="text-text-muted hover:text-text"><X size={20} /></button>
          <h2 className="font-bold">Tag People</h2>
          <button onClick={() => setStep('compose')} className="ml-auto btn-primary text-xs px-3 py-1.5">Done</button>
        </div>
        <div className="p-4">
          {taggedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {taggedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-primary-muted rounded-full border border-primary/30">
                  <Avatar user={u} size={20} />
                  <span className="text-xs font-semibold text-primary">{u.display_name || u.username}</span>
                  <button onClick={() => setTaggedUsers(prev => prev.filter(x => x.id !== u.id))} className="text-primary/60 hover:text-primary ml-0.5">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            placeholder="Search followers to tag…"
            className="input-base w-full mb-3"
            autoFocus
          />
          <div className="space-y-1">
            {searchedPeople.filter(p => !taggedUsers.find(u => u.id === p.id)).map((person: any) => (
              <button key={person.id}
                onClick={() => { setTaggedUsers(prev => [...prev, person]); setTagSearch('') }}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-bg-card2 transition-colors text-left">
                <Avatar user={person} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{person.display_name || person.username}</p>
                  <p className="text-xs text-text-muted">@{person.username}</p>
                </div>
                <span className="text-xs text-primary font-semibold flex-shrink-0">+ Tag</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── STEP: Location ─────────────────────────────────────────
  if (step === 'location') {
    return (
      <LocationStep
        locationName={locationName}
        setLocationName={setLocationName}
        locationGranted={locationGranted}
        area={area}
        locCity={locCity}
        requestLocation={requestLocation}
        useCurrentLocation={useCurrentLocation}
        setUseCurrentLocation={setUseCurrentLocation}
        onDone={() => setStep('compose')}
      />
    )
  }

  // ── STEP: Life Event ───────────────────────────────────────
  if (step === 'life_event') {
    return (
      <div className="min-h-screen bg-bg">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('compose')} className="text-text-muted hover:text-text"><X size={20} /></button>
          <h2 className="font-bold">Life Update</h2>
          {lifeEvent && (
            <button onClick={() => setStep('compose')} className="ml-auto btn-primary text-xs px-4 py-1.5">Done</button>
          )}
        </div>

        {/* Life event list */}
        <div className="p-4 space-y-2">
          {LIFE_EVENTS.map(e => (
            <button key={e.type}
              onClick={() => {
                setLifeEvent(e)
                setFeeling(null)
                setActivity(null)
                // Clear partners if switching to non-social event
                if (!SOCIAL_EVENTS.includes(e.type)) setLifeEventPartners([])
              }}
              className={cn(
                'flex items-center gap-3 w-full p-3.5 rounded-2xl border transition-all text-left',
                lifeEvent?.type === e.type
                  ? 'border-primary bg-primary-muted'
                  : 'border-border hover:border-border-active'
              )}>
              <span className="text-2xl">{e.emoji}</span>
              <div className="flex-1">
                <span className="text-sm font-semibold">{e.label}</span>
                {SOCIAL_EVENTS.includes(e.type) && (
                  <span className="text-xs text-text-muted ml-2">· can tag people</span>
                )}
              </div>
              {lifeEvent?.type === e.type && <span className="text-primary text-sm">✓</span>}
            </button>
          ))}
        </div>

        {/* "With whom?" section — only for social events */}
        {(lifeEvent && SOCIAL_EVENTS.includes(lifeEvent.type)) && (
          <div className="px-4 pb-6">
            <div className="bg-bg-card border border-border rounded-2xl p-4">
              <p className="text-sm font-bold mb-3">
                {lifeEvent?.type === 'married'       ? '💍 Who did you marry?' :
                 lifeEvent?.type === 'engaged'       ? '💍 Who are you engaged to?' :
                 lifeEvent?.type === 'relationship'  ? '❤️ Who are you in a relationship with?' :
                 lifeEvent?.type === 'new_baby'      ? '🍼 Tag your partner?' :
                 lifeEvent?.type === 'new_job'       ? '💼 Tag a colleague?' :
                 lifeEvent?.type === 'graduation'    ? '🎓 Tag friends from your batch?' :
                 lifeEvent?.type === 'birthday'      ? "🎂 Who's celebrating with you?" :
                 '👥 Tag people'}
              </p>

              {/* Tagged partners */}
              {lifeEventPartners.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {lifeEventPartners.map(u => (
                    <div key={u.id} className="flex items-center gap-1.5 bg-primary-muted border border-primary/30 rounded-full px-3 py-1">
                      <Avatar user={u} size={20} />
                      <span className="text-xs font-semibold text-primary">{u.display_name || u.username}</span>
                      <button onClick={() => setLifeEventPartners(p => p.filter(x => x.id !== u.id))}
                        className="text-primary/60 hover:text-accent-red ml-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Search followers/following */}
              <input
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Search your followers…"
                className="input-base w-full text-sm"
              />
              {tagSearch.length >= 2 && searchedPeople.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {searchedPeople
                    .filter(p => !lifeEventPartners.find(u => u.id === p.id))
                    .slice(0, 6)
                    .map((person: any) => (
                      <button key={person.id}
                        onClick={() => {
                          setLifeEventPartners(prev => [...prev, person])
                          setTagSearch('')
                        }}
                        className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-bg-card2 transition-colors text-left">
                        <Avatar user={person} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{person.display_name || person.username}</p>
                          <p className="text-xs text-text-muted">@{person.username}</p>
                        </div>
                        <span className="ml-auto text-primary text-xs font-bold">+ Add</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── MAIN COMPOSE VIEW ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg flex flex-col max-w-2xl mx-auto md:border-x md:border-border">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="text-text-muted hover:text-text">
            <X size={22} />
          </button>
          <h1 className="font-bold text-base">New Post</h1>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmitPost}
            className="btn-primary text-sm py-2 px-5 flex items-center gap-1.5">
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {isSubmitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Author row */}
          <div className="flex items-center gap-3">
            <Avatar user={profile} size={44} />
            <div>
              <p className="font-bold text-sm">{profile?.display_name || profile?.full_name || profile?.username}</p>
              {statusLine && (
                <p className="text-xs text-primary leading-relaxed">{statusLine}</p>
              )}
            </div>
          </div>

          {/* ── Feeling / Activity addon row ─────────────── */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStep('feeling')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                feeling ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active')}>
              {feeling ? <>{feeling.emoji} {feeling.label}</> : <><Smile size={12} /> Feeling</>}
            </button>
            <button onClick={() => setStep('activity')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                activity ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active')}>
              {activity ? <>{activity.emoji} {activity.label}</> : <><Film size={12} /> Activity</>}
            </button>
            <button onClick={() => setStep('tag_people')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                taggedUsers.length > 0 ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active')}>
              {taggedUsers.length > 0 ? <><Users size={12} /> {taggedUsers.length} tagged</> : <><Users size={12} /> People</>}
            </button>
            <button onClick={() => setStep('location')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                locationName ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active')}>
              {locationName ? <><MapPin size={12} /> {locationName.slice(0, 15)}{locationName.length > 15 ? '…' : ''}</> : <><MapPin size={12} /> Location</>}
            </button>
            <button onClick={() => setStep('life_event')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                lifeEvent ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active')}>
              {lifeEvent ? (
                <span className="flex items-center gap-1">
                  {lifeEvent.emoji} {lifeEvent.label}
                  {lifeEventPartners.length > 0 && (
                    <span className="text-text-muted">
                      {' '}with {lifeEventPartners.map(u => u.display_name || u.username).join(' & ')}
                    </span>
                  )}
                </span>
              ) : <><Star size={12} /> Life Update</>}
            </button>
          </div>

          {/* Activity detail input */}
          {activity && (
            <input
              value={activityDetail}
              onChange={e => setActivityDetail(e.target.value)}
              placeholder={activity.placeholder}
              className="input-base text-sm"
              maxLength={100}
            />
          )}

          {/* Text area */}
          <div className="relative">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, 5000))}
              placeholder={lifeEvent
                ? `Tell everyone about ${lifeEvent.label.toLowerCase()}…`
                : "What's on your mind?"}
              className="w-full bg-transparent resize-none text-base leading-relaxed outline-none min-h-[140px] placeholder:text-text-muted"
              autoFocus
            />
            <div className={cn(
              "text-xs text-right mt-1 transition-colors",
              charCount > charMax * 0.9 ? 'text-accent-red' : 'text-text-muted'
            )}>
              {charCount}/{charMax}
            </div>
          </div>

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className={cn(
              "grid gap-2",
              mediaPreviews.length === 1 ? "grid-cols-1" :
              mediaPreviews.length <= 4 ? "grid-cols-2" : "grid-cols-3"
            )}>
              {mediaPreviews.map((src, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-bg-card2">
                  {mediaFiles[i]?.type.startsWith('video/') ? (
                    <video src={src} className="w-full aspect-video object-cover" muted playsInline />
                  ) : (
                    <img src={src} alt="" className="w-full aspect-square object-cover" />
                  )}
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white">
                    <X size={12} />
                  </button>
                  {mediaFiles[i]?.type.startsWith('video/') && (
                    <div className="absolute bottom-1.5 left-1.5 bg-black/60 rounded px-1.5 py-0.5 text-xs text-white">
                      60s max
                    </div>
                  )}
                </div>
              ))}
              {mediaPreviews.length < 10 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors">
                  <Plus size={20} className="text-text-muted" />
                </button>
              )}
            </div>
          )}

          {/* GIF preview */}
          {gifUrl && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={gifUrl} alt="GIF" className="w-full max-h-64 object-cover rounded-xl" />
              <button onClick={() => setGifUrl('')}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white">
                <X size={12} />
              </button>
            </div>
          )}

          {/* GIF search — real Tenor search */}
          {showGifSearch && (
            <GifPicker
              onSelect={(url) => { setGifUrl(url); setShowGifSearch(false) }}
              onClose={() => setShowGifSearch(false)}
            />
          )}

          {/* Tags */}
          <div className="space-y-2">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary-muted rounded-full text-xs font-semibold text-primary border border-primary/30">
                    #{t}
                    <button onClick={() => setTags(prev => prev.filter(x => x !== t))}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && tagInput.trim()) {
                  const clean = tagInput.trim().replace(/^#/, '').toLowerCase()
                  if (clean.length < 2) { toast.error('Tag must be 2+ characters'); return }
                  if (clean.length > 30) { toast.error('Tag too long (max 30 chars)'); return }
                  if (!tags.includes(clean)) setTags(prev => [...prev, clean].slice(0, 5))
                  setTagInput('')
                  e.preventDefault()
                }
              }}
              placeholder="Add hashtags (press Enter)…"
              className="input-base text-sm"
              maxLength={30}
            />
          </div>

          {/* Audience Scope */}
          <PostScopeSelector
            value={postScope}
            onChange={setPostScope}
            city={locCity}
            hasLocation={locationGranted}
          />

          {/* Post options */}
          <div className="flex flex-wrap gap-2 pt-1">
            <ToggleChip active={isAnonymous} onChange={setIsAnonymous} label="Anonymous" emoji="🎭" />
            <ToggleChip active={isMystery} onChange={setIsMystery} label="Mystery" emoji="✨" />
            <ToggleChip active={isSensitive} onChange={setIsSensitive} label="Sensitive" emoji="⚠️" />
          </div>
        </div>
      </div>

      {/* Bottom media toolbar */}
      <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-border px-4 py-3 safe-bottom">
        <div className="flex gap-3 justify-around">
          <MediaButton icon={<ImageIcon size={20} />} label="Gallery"
            onClick={() => { fileInputRef.current && (fileInputRef.current.accept = 'image/*,video/*'); fileInputRef.current?.click() }} />
          <MediaButton icon={<span className="text-lg font-black text-text-secondary">GIF</span>} label="GIF"
            onClick={() => setShowGifSearch(s => !s)} />
          <MediaButton icon={<Star size={20} />} label="Life Update"
            onClick={() => setStep('life_event')} />
          <MediaButton icon={<Smile size={20} />} label="Feeling"
            onClick={() => setStep('feeling')} />
          <MediaButton icon={<MapPin size={20} />} label="Location"
            onClick={() => setStep('location')} />
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden"
        accept="image/*,video/*" multiple onChange={handleFileSelect} />
    </div>
  )
}


// ── GIF Picker — uses Tenor public API (no key needed) ──────
function GifPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) {
      // Show trending GIFs on open
      searchGifs('trending')
      return
    }
    const t = setTimeout(() => searchGifs(query), 400)
    return () => clearTimeout(t)
  }, [query])

  async function searchGifs(q: string) {
    setLoading(true)
    try {
      // GIPHY API key — get free key from https://developers.giphy.com/
      const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'dc6zaTOxFJmzC'
      const endpoint = q === 'trending'
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=16&rating=g`
        : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=16&rating=g`

      const res = await fetch(endpoint)
      if (!res.ok) throw new Error('Giphy error')
      const data = await res.json()
      const urls = (data.data || []).map((g: any) =>
        g.images?.fixed_height_small?.url ||
        g.images?.fixed_height?.url ||
        g.images?.downsized?.url
      ).filter(Boolean)
      setResults(urls)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          className="input-base text-sm flex-1"
        />
        <button onClick={onClose} className="text-text-muted hover:text-text p-1">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto">
          {results.map((url, i) => (
            <button key={i} onClick={() => onSelect(url)}
              className="rounded-lg overflow-hidden bg-bg-card2 aspect-square hover:opacity-80 transition-opacity">
              <img src={url} alt="gif" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">
          No results — or paste a GIF URL below
        </p>
      )}

      {/* Direct URL fallback */}
      <div className="flex gap-2">
        <input
          value={pasteUrl}
          onChange={e => setPasteUrl(e.target.value)}
          placeholder="Or paste GIF URL…"
          className="input-base text-xs flex-1"
        />
        {pasteUrl && (
          <button onClick={() => onSelect(pasteUrl)}
            className="btn-primary text-xs px-3 py-1.5">Use</button>
        )}
      </div>
      <p className="text-[10px] text-text-muted text-center">Powered by GIPHY</p>
    </div>
  )
}


// ── Location Step with place suggestions ─────────────────────
function LocationStep({
  locationName, setLocationName, locationGranted,
  area, locCity, requestLocation, useCurrentLocation,
  setUseCurrentLocation, onDone
}: {
  locationName: string; setLocationName: (v: string) => void
  locationGranted: boolean; area: string | null; locCity: string | null
  requestLocation: () => void; useCurrentLocation: boolean
  setUseCurrentLocation: (v: boolean) => void; onDone: () => void
}) {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return }
    setSearching(true)
    try {
      // OpenStreetMap Nominatim — free, no API key
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      if (!res.ok) throw new Error('Nominatim error')
      const data = await res.json()
      setSuggestions(data)
    } catch {
      setSuggestions([])
    } finally {
      setSearching(false)
    }
  }

  function handleInput(val: string) {
    setLocationName(val)
    setUseCurrentLocation(false)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchSuggestions(val), 400)
  }

  function pickSuggestion(place: any) {
    // Build a readable place name
    const addr = place.address || {}
    const parts = [
      addr.amenity || addr.shop || addr.building,
      addr.road,
      addr.suburb || addr.neighbourhood || addr.village,
      addr.city || addr.town || addr.county,
      addr.state,
    ].filter(Boolean)
    const name = parts.length > 0 ? parts.slice(0, 3).join(', ') : place.display_name.split(',').slice(0, 2).join(', ')
    setLocationName(name)
    setSuggestions([])
    setUseCurrentLocation(false)
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
        <button onClick={onDone} className="text-text-muted hover:text-text"><X size={20} /></button>
        <h2 className="font-bold">Add Location</h2>
        <button onClick={onDone} className="ml-auto btn-primary text-xs px-3 py-1.5">Done</button>
      </div>
      <div className="p-4 space-y-3">
        {/* Current location button */}
        {locationGranted && (area || locCity) && (
          <button
            onClick={() => { setUseCurrentLocation(true); setLocationName(area || locCity || ''); setSuggestions([]); onDone() }}
            className="flex items-center gap-3 w-full p-4 rounded-2xl border border-primary/30 bg-primary-muted text-left">
            <MapPin size={20} className="text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Current location</p>
              <p className="text-xs text-text-muted">{area || locCity}</p>
            </div>
          </button>
        )}
        {!locationGranted && (
          <button onClick={requestLocation}
            className="flex items-center gap-3 w-full p-4 rounded-2xl border border-border text-left hover:border-primary transition-colors">
            <MapPin size={20} className="text-text-muted" />
            <p className="text-sm">Enable location access</p>
          </button>
        )}

        {/* Search input */}
        <div className="relative">
          <MapPin size={14} className="absolute left-3.5 top-3.5 text-text-muted" />
          <input
            value={locationName}
            onChange={e => handleInput(e.target.value)}
            placeholder="Search a place… (e.g. Victoria Memorial)"
            className="input-base pl-9 w-full"
            autoFocus
          />
          {searching && (
            <div className="absolute right-3 top-3">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Suggestions list */}
        {suggestions.length > 0 && (
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
            {suggestions.map((place: any, i: number) => {
              const addr = place.address || {}
              const city = addr.city || addr.town || addr.county || ''
              const country = addr.country || ''
              const short = place.display_name.split(',').slice(0, 2).join(', ')
              return (
                <button key={i} onClick={() => pickSuggestion(place)}
                  className="flex items-center gap-3 w-full p-3.5 text-left hover:bg-bg-card2 transition-colors border-b border-border last:border-0">
                  <MapPin size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{short}</p>
                    {city && <p className="text-xs text-text-muted">{[city, country].filter(Boolean).join(', ')}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {locationName && (
          <button onClick={() => { setLocationName(''); setUseCurrentLocation(false); setSuggestions([]) }}
            className="text-xs text-accent-red">Remove location</button>
        )}
      </div>
    </div>
  )
}

function ToggleChip({ active, onChange, label, emoji }: {
  active: boolean; onChange: (v: boolean) => void; label: string; emoji: string
}) {
  return (
    <button onClick={() => onChange(!active)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
        active ? 'border-primary bg-primary-muted text-primary' : 'border-border text-text-secondary hover:border-border-active'
      )}>
      <span>{emoji}</span> {label}
    </button>
  )
}

function MediaButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-text-secondary hover:text-text transition-colors px-2">
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-card2 hover:bg-bg-card border border-border transition-colors">
        {icon}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  )
}
