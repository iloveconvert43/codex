'use client'

import { swrFetcher } from '@/lib/api'
const fetcher = swrFetcher

import { useState, useRef, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { Plus, X, Eye, Send, Heart } from 'lucide-react'
import { api, getErrorMessage } from '@/lib/api'
import { useMediaUpload } from '@/hooks/useMediaUpload'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Story } from '@/types'

interface StoryGroup {
  user: any
  is_anonymous: boolean
  stories: Story[]
  has_unviewed: boolean
}

// Dynamic story duration based on content length
function getStoryDuration(story: Story): number {
  if (story.video_url) return 15000          // 15s for video
  if (!story.content) return 5000             // 5s for image-only
  const words = story.content.split(' ').length
  return Math.max(5000, Math.min(12000, words * 400))  // 400ms/word, 5-12s
}

function getRelativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
  return 'yesterday'
}

// ── Story Creator ─────────────────────────────────────────────
function StoryCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth()
  const [step, setStep] = useState<'design' | 'details'>('design')
  const [content, setContent] = useState('')
  const [bgColor, setBgColor] = useState('#6C63FF')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [textSize, setTextSize] = useState<'sm'|'md'|'lg'|'xl'>('md')
  const [textAlign, setTextAlign] = useState<'left'|'center'|'right'>('center')
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<any[]>([])
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([])
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const BG_GRADIENTS = [
    { color: '#6C63FF', label: 'Purple' },
    { color: '#FF6B6B', label: 'Red'    },
    { color: '#4ECDC4', label: 'Teal'   },
    { color: '#45B7D1', label: 'Blue'   },
    { color: '#FFA07A', label: 'Peach'  },
    { color: '#F7DC6F', label: 'Yellow' },
    { color: '#BB8FCE', label: 'Violet' },
    { color: '#2C3E50', label: 'Dark'   },
    { color: '#1ABC9C', label: 'Green'  },
    { color: '#E74C3C', label: 'Crimson'},
  ]

  const TEXT_SIZES = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-2xl' }
  const ALIGN_MAP  = { left: 'text-left', center: 'text-center', right: 'text-right' }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast.error('Max 50MB'); return }
    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  // Mention search
  async function searchMentions(q: string) {
    if (q.length < 1) { setMentionResults([]); return }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=people&limit=6`)
      const data = await res.json()
      setMentionResults(data?.data?.people || [])
    } catch { setMentionResults([]) }
  }

  function handleContentChange(val: string) {
    setContent(val.slice(0, 500))
    // Detect @ mention trigger
    const lastAt = val.lastIndexOf('@')
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentionPicker(true)
      setMentionQuery('')
      searchMentions('')
    } else if (lastAt !== -1 && val.slice(lastAt + 1).match(/^[a-zA-Z0-9_]*$/)) {
      const q = val.slice(lastAt + 1)
      setMentionQuery(q)
      setShowMentionPicker(true)
      searchMentions(q)
    } else {
      setShowMentionPicker(false)
      setMentionQuery('')
    }
  }

  function pickMention(user: any) {
    const lastAt = content.lastIndexOf('@')
    const before = content.slice(0, lastAt)
    const handle = user.username || user.display_name
    setContent(before + '@' + handle + ' ')
    setMentionedUsers(prev => prev.find(u => u.id === user.id) ? prev : [...prev, user])
    setShowMentionPicker(false)
    setMentionQuery('')
    setTimeout(() => textRef.current?.focus(), 50)
  }

  function removeMention(uid: string) {
    setMentionedUsers(prev => prev.filter(u => u.id !== uid))
  }

  async function handleSubmit() {
    if (!content.trim() && !mediaFile) { toast.error('Add text or a photo to your story'); return }
    setSubmitting(true)
    try {
      let image_url: string | null = null
      let video_url: string | null = null

      if (mediaFile) {
        const isVideo = mediaFile.type.startsWith('video/')
        // Compress image before upload
        let fileToUpload = mediaFile
        if (!isVideo) {
          try {
            const { compressImage } = await import('@/lib/media')
            const comp = await compressImage(mediaFile)
            fileToUpload = comp.file
          } catch { /* use original */ }
        }
        const { uploadToImageKit } = await import('@/lib/upload')
        const uploadResult = await uploadToImageKit(
          fileToUpload,
          isVideo ? 'videos' : 'images'
        )
        if (!uploadResult?.url) throw new Error('Upload failed')
        if (isVideo) video_url = uploadResult.url
        else image_url = uploadResult.url
      }

      await api.post('/api/stories', {
        content:    content.trim() || null,
        // Only send image_url/video_url if they have a value
        ...(image_url ? { image_url } : {}),
        ...(video_url ? { video_url } : {}),
        bg_color:   bgColor    || '#6C63FF',
        is_anonymous: isAnonymous,
        mentioned_user_ids: mentionedUsers.map(u => u.id),
        text_size:  textSize  || 'md',
        text_align: textAlign || 'center',
        text_color: textColor || '#FFFFFF',
      }, { requireAuth: true })

      toast.success('Story posted! 🎉')
      if (mediaPreview) URL.revokeObjectURL(mediaPreview)
      onCreated()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const textSizeCls  = TEXT_SIZES[textSize]
  const textAlignCls = ALIGN_MAP[textAlign]

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex-1 flex flex-col max-w-sm w-full mx-auto" onClick={e => e.stopPropagation()}>

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 pt-12 pb-4">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
            <X size={18} className="text-white" />
          </button>
          <span className="text-white font-bold text-base">Create Story</span>
          <button
            onClick={() => setStep(step === 'design' ? 'details' : 'design')}
            className="text-xs text-white/70 font-semibold bg-white/10 px-3 py-1.5 rounded-full">
            {step === 'design' ? 'Next →' : '← Back'}
          </button>
        </div>

        {step === 'design' ? (
          <>
            {/* ── Full-height preview ── */}
            <div className="flex-1 mx-4 rounded-3xl overflow-hidden relative flex items-center justify-center"
              style={{ background: mediaPreview ? '#000' : bgColor, minHeight: 320 }}>

              {mediaPreview && mediaFile?.type.startsWith('video/') ? (
                <video src={mediaPreview} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay loop />
              ) : mediaPreview ? (
                <img src={mediaPreview} className="absolute inset-0 w-full h-full object-cover" alt="" loading="lazy" />
              ) : null}

              {/* Text overlay */}
              {content ? (
                <div className={cn(
                  "relative z-10 px-6 py-3 max-w-[85%]",
                  mediaPreview ? "bg-black/50 rounded-2xl backdrop-blur-sm" : ""
                )}>
                  <p className={cn("font-bold leading-snug drop-shadow-lg", textSizeCls, textAlignCls)}
                    style={{ color: textColor }}>
                    {content}
                  </p>
                </div>
              ) : !mediaPreview ? (
                <p className="text-white/30 text-sm font-medium">Tap below to write...</p>
              ) : null}

              {/* Mentioned users badges on preview */}
              {mentionedUsers.length > 0 && (
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-1.5 z-20">
                  {mentionedUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-1.5 bg-black/60 backdrop-blur rounded-full px-2 py-1">
                      <Avatar user={u} size={16} />
                      <span className="text-white text-[10px] font-semibold">@{u.username || u.display_name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Remove media btn */}
              {mediaPreview && (
                <button onClick={() => { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); setMediaFile(null) }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center z-30">
                  <X size={14} className="text-white" />
                </button>
              )}
            </div>

            {/* ── Tools row ── */}
            <div className="flex items-center justify-between px-5 py-3">
              {/* Text size */}
              <div className="flex gap-2">
                {(['sm','md','lg','xl'] as const).map(s => (
                  <button key={s} onClick={() => setTextSize(s)}
                    className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white font-bold transition-all",
                      textSize === s ? "bg-white/30" : "bg-white/10")}>
                    <span className={TEXT_SIZES[s]}>A</span>
                  </button>
                ))}
              </div>

              {/* Align */}
              <div className="flex gap-1.5">
                {(['left','center','right'] as const).map(a => (
                  <button key={a} onClick={() => setTextAlign(a)}
                    className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      textAlign === a ? "bg-white/30" : "bg-white/10")}>
                    <span className="text-white text-[10px] font-bold">{a === 'left' ? '◀' : a === 'center' ? '■' : '▶'}</span>
                  </button>
                ))}
              </div>

              {/* Text color */}
              <div className="flex gap-1.5">
                {['#FFFFFF','#FFD93D','#FF6B6B','#6BCB77'].map(c => (
                  <button key={c} onClick={() => setTextColor(c)}
                    className={cn("w-7 h-7 rounded-full border-2 transition-all",
                      textColor === c ? "border-white scale-110" : "border-white/30")}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            {/* ── Text input ── */}
            <div className="mx-4 relative">
              <textarea
                ref={textRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder="What's on your mind? (type @ to mention)"
                rows={2} maxLength={500}
                className="w-full bg-white/10 text-white placeholder-white/40 rounded-2xl px-4 py-3 text-sm resize-none outline-none focus:ring-1 focus:ring-white/30"
              />
              <span className="absolute bottom-2 right-3 text-white/30 text-[10px]">{content.length}/500</span>

              {/* Mention dropdown */}
              {showMentionPicker && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-bg-card border border-border rounded-2xl overflow-hidden shadow-xl z-50 max-h-48 overflow-y-auto">
                  {mentionResults.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-3">No users found</p>
                  ) : mentionResults.map((user: any) => (
                    <button key={user.id} onClick={() => pickMention(user)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-bg-card2 transition-colors text-left">
                      <Avatar user={user} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{user.display_name || user.username}</p>
                        <p className="text-xs text-text-muted">@{user.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── BG Colors ── */}
            {!mediaPreview && (
              <div className="flex gap-2.5 px-4 py-3 overflow-x-auto hide-scrollbar">
                {BG_GRADIENTS.map(({ color }) => (
                  <button key={color} onClick={() => setBgColor(color)}
                    className={cn("w-9 h-9 rounded-full flex-shrink-0 transition-all",
                      bgColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-110" : "opacity-70")}
                    style={{ background: color }} />
                ))}
              </div>
            )}

            {/* ── Bottom actions ── */}
            <div className="flex items-center gap-3 px-4 pb-8 pt-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-white text-sm font-semibold">
                📷 Photo/Video
              </button>
              <button onClick={handleSubmit} disabled={submitting || (!content.trim() && !mediaFile)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform">
                {submitting ? '⏳' : '📤'} {submitting ? 'Posting…' : 'Post Story'}
              </button>
            </div>
          </>
        ) : (
          /* ── DETAILS STEP ── */
          <div className="flex-1 px-4 space-y-4 overflow-y-auto">
            {/* Mini preview */}
            <div className="w-24 h-36 rounded-2xl mx-auto overflow-hidden relative flex items-center justify-center"
              style={{ background: mediaPreview ? '#000' : bgColor }}>
              {mediaPreview && <img src={mediaPreview} className="absolute inset-0 w-full h-full object-cover" alt="" loading="lazy" />}
              {content && (
                <p className={cn("relative z-10 text-[8px] font-bold text-center px-2 leading-snug", textAlignCls)}
                  style={{ color: textColor }}>{content.slice(0,60)}</p>
              )}
            </div>

            {/* Anonymous toggle */}
            <button onClick={() => setIsAnonymous(a => !a)}
              className={cn("w-full flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all",
                isAnonymous ? "border-primary bg-primary/10" : "border-border bg-bg-card")}>
              <span className="text-2xl">{isAnonymous ? '🕵️' : '😊'}</span>
              <div className="text-left flex-1">
                <p className="font-semibold text-sm">{isAnonymous ? 'Anonymous' : 'As Yourself'}</p>
                <p className="text-xs text-text-muted">{isAnonymous ? 'Your identity stays hidden' : 'Shows your name and photo'}</p>
              </div>
              <div className={cn("w-10 h-6 rounded-full p-0.5 transition-colors",
                isAnonymous ? "bg-primary" : "bg-bg-card2")}>
                <div className={cn("w-5 h-5 rounded-full bg-white shadow transition-transform",
                  isAnonymous ? "translate-x-4" : "translate-x-0")} />
              </div>
            </button>

            {/* Mentioned users */}
            {mentionedUsers.length > 0 && (
              <div className="bg-bg-card border border-border rounded-2xl p-4">
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Mentions</p>
                <div className="space-y-2">
                  {mentionedUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3">
                      <Avatar user={u} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{u.display_name || u.username}</p>
                        <p className="text-xs text-text-muted">@{u.username}</p>
                      </div>
                      <button onClick={() => removeMention(u.id)} className="text-text-muted hover:text-accent-red transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Post button */}
            <button onClick={handleSubmit} disabled={submitting || (!content.trim() && !mediaFile)}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? '⏳ Posting…' : '📤 Post Story (24h)'}
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleFile} />
      </div>
    </div>
  )
}


// ── Story Viewer ──────────────────────────────────────────────
export default function StoriesBar() {
  const { profile, isLoggedIn } = useAuth()
  const { data, mutate, isLoading } = useSWR<{ data: StoryGroup[] }>('/api/stories', fetcher, {
    refreshInterval: 60000 })

  const rawGroups: StoryGroup[] = data?.data ?? []
  const now = Date.now()
  const groups = rawGroups.map(g => ({
    ...g,
    stories: g.stories.filter(s => !s.expires_at || new Date(s.expires_at).getTime() > now)
  })).filter(g => g.stories.length > 0)

  const [viewing, setViewing] = useState<{ groupIndex: number; storyIndex: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [showReply, setShowReply] = useState(false)
  const [storyReaction, setStoryReaction] = useState<string | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pauseStartRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)

  const openStory = useCallback((groupIndex: number) => {
    setViewing({ groupIndex, storyIndex: 0 })
    setProgress(0)
    setShowReply(false)
    setStoryReaction(null)
    elapsedRef.current = 0
  }, [])

  const closeStory = useCallback(() => {
    setViewing(null)
    setProgress(0)
    setShowReply(false)
    if (progressRef.current) clearInterval(progressRef.current)
  }, [])

  const nextStory = useCallback(() => {
    if (!viewing) return
    const group = groups[viewing.groupIndex]
    if (!group) return
    elapsedRef.current = 0
    setShowReply(false)
    setStoryReaction(null)
    if (viewing.storyIndex < group.stories.length - 1) {
      setViewing(v => v ? { ...v, storyIndex: v.storyIndex + 1 } : null)
      setProgress(0)
    } else if (viewing.groupIndex < groups.length - 1) {
      setViewing({ groupIndex: viewing.groupIndex + 1, storyIndex: 0 })
      setProgress(0)
    } else {
      closeStory()
    }
  }, [viewing, groups, closeStory])

  const prevStory = useCallback(() => {
    if (!viewing) return
    elapsedRef.current = 0
    setShowReply(false)
    if (viewing.storyIndex > 0) {
      setViewing(v => v ? { ...v, storyIndex: v.storyIndex - 1 } : null)
      setProgress(0)
    } else if (viewing.groupIndex > 0) {
      const prevGroup = groups[viewing.groupIndex - 1]
      setViewing({ groupIndex: viewing.groupIndex - 1, storyIndex: prevGroup.stories.length - 1 })
      setProgress(0)
    }
  }, [viewing, groups])

  // Auto-advance with pause support + dynamic duration
  useEffect(() => {
    if (!viewing) return
    const story = groups[viewing.groupIndex]?.stories[viewing.storyIndex]
    if (!story) return

    // Track view + affinity signal
    api.post(`/api/stories/${story.id}/view`, {}).catch(() => {})
    if (story.user_id && !story.is_anonymous) {
      // Author affinity (not post_id — story signal, not post signal)
      fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ post_id: null, action: 'view', _story_user_id: story.user_id }]),
        keepalive: true
      }).catch(() => {})
    }

    const duration = getStoryDuration(story)
    const tick = 50

    if (progressRef.current) clearInterval(progressRef.current)
    progressRef.current = setInterval(() => {
      if (isPaused) return
      elapsedRef.current += tick
      const pct = Math.min(100, (elapsedRef.current / duration) * 100)
      setProgress(pct)
      if (pct >= 100) nextStory()
    }, tick)

    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [viewing?.groupIndex, viewing?.storyIndex, isPaused])

  // Keyboard nav
  useEffect(() => {
    if (!viewing) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStory()
      if (e.key === 'ArrowLeft') prevStory()
      if (e.key === 'Escape') closeStory()
      if (e.key === ' ') setIsPaused(p => !p)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [viewing, nextStory, prevStory, closeStory])

  async function sendReply() {
    if (!replyText.trim() || !viewing) return
    const story = groups[viewing.groupIndex]?.stories[viewing.storyIndex]
    if (!story) return
    try {
      await api.post('/api/messages/send', {
        to_user_id: story.user_id,
        content: `↩️ Replied to your story: ${replyText.trim()}`
      }, { requireAuth: true })
      toast.success('Reply sent!')
      setReplyText('')
      setShowReply(false)
    } catch { toast.error('Could not send reply') }
  }

  async function reactToStory(emoji: string) {
    if (!viewing) return
    const story = groups[viewing.groupIndex]?.stories[viewing.storyIndex]
    if (!story) return
    setStoryReaction(emoji)
    try {
      await api.patch(`/api/stories/${story.id}/view`, { reaction: emoji }, { requireAuth: true })
    } catch {}
  }

  const STORY_REACTIONS = ['❤️','😂','😮','😢','🔥','👏']

  const activeStory = viewing ? groups[viewing.groupIndex]?.stories[viewing.storyIndex] : null
  const isOwnStory = activeStory?.user_id === profile?.id

  if (isLoading) return (
    <div className="flex gap-3 px-4 py-3 overflow-x-auto border-b border-border hide-scrollbar">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="w-14 h-14 rounded-full bg-bg-card2 animate-pulse" />
          <div className="w-10 h-2 rounded bg-bg-card2 animate-pulse" />
        </div>
      ))}
    </div>
  )

  return (
    <>
      {/* Stories row */}
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        {isLoggedIn && (
          <button onClick={() => setShowCreator(true)}
            className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative w-14 h-14 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-bg-card2 hover:border-primary transition-colors">
              <Plus size={20} className="text-text-muted" />
            </div>
            <span className="text-[10px] text-text-muted font-medium whitespace-nowrap">Your Story</span>
          </button>
        )}

        {groups.map((group, i) => {
          const displayName = group.is_anonymous ? 'Anonymous' : (group.user?.display_name || group.user?.username || '?')
          const initial = displayName[0]?.toUpperCase()
          return (
            <button key={group.user?.id ?? `anon-${i}`} onClick={() => openStory(i)}
              className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={cn(
                'w-14 h-14 rounded-full p-[2px] flex-shrink-0',
                group.has_unviewed
                  ? 'bg-gradient-to-tr from-primary via-accent-red to-accent-yellow'
                  : 'bg-border'
              )}>
                <div className="w-full h-full rounded-full overflow-hidden bg-bg-card2 border-2 border-bg">
                  {group.is_anonymous ? (
                    <div className="w-full h-full flex items-center justify-center text-lg">🕵️</div>
                  ) : group.user?.avatar_url ? (
                    <img src={group.user.avatar_url} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'linear-gradient(135deg,#6C63FF,#FF6B6B)', color: '#fff' }}>
                      {initial}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-text-secondary truncate max-w-[56px]">
                {group.user?.id === profile?.id ? 'You' : displayName.split(' ')[0]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Story viewer */}
      {viewing && activeStory && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && closeStory()}>
          <div className="relative w-full max-w-sm h-full max-h-[750px] flex flex-col"
            style={{ aspectRatio: '9/16' }}>

            {/* Progress bars */}
            <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
              {groups[viewing.groupIndex].stories.map((_, si) => (
                <div key={si} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-none"
                    style={{ width: si < viewing.storyIndex ? '100%' : si === viewing.storyIndex ? `${progress}%` : '0%' }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-8 left-3 right-3 z-20 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/60 bg-white/20 flex items-center justify-center flex-shrink-0">
                {groups[viewing.groupIndex].is_anonymous ? <span>🕵️</span>
                  : groups[viewing.groupIndex].user?.avatar_url
                  ? <img src={groups[viewing.groupIndex].user.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <span className="text-white font-bold text-sm">{(groups[viewing.groupIndex].user?.display_name || '?')[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold leading-tight">
                  {groups[viewing.groupIndex].is_anonymous ? 'Anonymous'
                    : (groups[viewing.groupIndex].user?.display_name || groups[viewing.groupIndex].user?.username)}
                </p>
                <p className="text-white/50 text-[10px]">
                  {getRelativeTime(activeStory.created_at)} ·{' '}
                  {Math.ceil((new Date(activeStory.expires_at || '').getTime() - Date.now()) / 3600000)}h left
                  {(groups[viewing.groupIndex] as any).social_context === 'affinity' && (
                    <span className="ml-1 text-primary/80">· suggested</span>
                  )}
                </p>
              </div>
              {/* View count + highlight for own stories */}
              {isOwnStory && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-white/70 text-xs">
                    <Eye size={12} />
                    <span>{activeStory.view_count || 0}</span>
                  </div>
                  <button
                    onClick={() => {
                      fetch('/api/stories/highlights', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ story_id: activeStory.id, title: 'Highlight' })
                      }).then(() => toast.success('Saved to highlights ✨')).catch(() => {})
                    }}
                    className="text-white/60 hover:text-white text-[10px] border border-white/20 rounded-full px-2 py-0.5">
                    ✨ Save
                  </button>
                </div>
              )}
              {/* Pause indicator */}
              {isPaused && <span className="text-white/70 text-xs">⏸</span>}
              <button onClick={closeStory} className="text-white/80 hover:text-white ml-1">
                <X size={22} />
              </button>
            </div>

            {/* Story content area */}
            <div
              className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden relative select-none"
              style={{ background: activeStory.image_url || activeStory.video_url ? '#000' : activeStory.bg_color }}
              onMouseDown={() => setIsPaused(true)}
              onMouseUp={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
            >
              {/* Video story */}
              {activeStory.video_url && (
                <video
                  src={activeStory.video_url}
                  className="w-full h-full object-cover absolute inset-0"
                  autoPlay muted playsInline loop
                />
              )}
              {/* Image story */}
              {activeStory.image_url && !activeStory.video_url && (
                <img src={activeStory.image_url} alt="" className="w-full h-full object-cover absolute inset-0" loading="lazy" />
              )}
              {/* Text content — uses saved text_size/align/color */}
              {activeStory.content && (() => {
                const sz: Record<string,string> = { sm:'text-sm', md:'text-base', lg:'text-xl', xl:'text-2xl' }
                const al: Record<string,string> = { left:'text-left', center:'text-center', right:'text-right' }
                const szClass = sz[activeStory.text_size || 'md'] || 'text-xl'
                const alClass = al[activeStory.text_align || 'center'] || 'text-center'
                const color = activeStory.text_color || '#FFFFFF'
                return (
                  <div className={cn(
                    'relative z-10 px-8',
                    alClass,
                    (activeStory.image_url || activeStory.video_url) ? 'bg-black/40 backdrop-blur-sm rounded-xl p-4' : ''
                  )}>
                    <p className={cn('font-bold leading-relaxed drop-shadow-lg', szClass)}
                      style={{ color }}>
                      {activeStory.content}
                    </p>
                  </div>
                )
              })()}
              {/* Paused overlay */}
              {isPaused && (
                <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/20">
                  <span className="text-white/70 text-4xl">⏸</span>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="absolute bottom-4 left-3 right-3 z-20 space-y-2">
              {/* Reaction bar */}
              {!isOwnStory && isLoggedIn && !showReply && (
                <div className="flex items-center gap-2 justify-center">
                  {STORY_REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => reactToStory(emoji)}
                      className={cn(
                        "text-xl w-10 h-10 flex items-center justify-center rounded-full transition-all",
                        storyReaction === emoji
                          ? "bg-white/30 scale-125"
                          : "bg-black/30 hover:bg-white/20 active:scale-110"
                      )}>
                      {emoji}
                    </button>
                  ))}
                  <button onClick={() => setShowReply(r => !r)}
                    className="bg-black/30 hover:bg-white/20 w-10 h-10 rounded-full flex items-center justify-center text-white">
                    <Send size={16} />
                  </button>
                </div>
              )}

              {/* Reply input */}
              {showReply && isLoggedIn && (
                <div className="flex gap-2">
                  <input
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Reply to story…"
                    className="flex-1 bg-black/50 text-white placeholder-white/50 rounded-full px-4 py-2 text-sm outline-none border border-white/20"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && sendReply()}
                  />
                  <button onClick={sendReply} disabled={!replyText.trim()}
                    className="bg-primary text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40">
                    <Send size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Tap zones (narrow to leave center for long-press) */}
            <button className="absolute left-0 top-0 h-full w-1/4 z-10" onClick={prevStory} />
            <button className="absolute right-0 top-0 h-full w-1/4 z-10" onClick={nextStory} />
          </div>
        </div>
      )}

      {/* Story creator modal */}
      {showCreator && (
        <StoryCreator
          onClose={() => setShowCreator(false)}
          onCreated={() => { setShowCreator(false); mutate() }}
        />
      )}
    </>
  )
}
