'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ArrowLeft,
  Send,
  Loader2,
  Trash2,
  ImagePlus,
  SmilePlus,
  AtSign,
  ThumbsUp,
  ThumbsDown,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getRelativeTime, cn } from '@/lib/utils'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import FeedCard from '@/components/feed/FeedCard'
import Avatar from '@/components/ui/Avatar'
import { PostSkeleton } from '@/components/ui/Skeleton'
import toast from 'react-hot-toast'
import type { Comment, CommentReactionType } from '@/types'
import { usePendingPost } from '@/hooks/usePendingPosts'
import { removePendingPost } from '@/lib/pendingPosts'
import { supabase } from '@/lib/supabase'
import { buildLatestCommentPreview, incrementPostCommentEverywhere } from '@/lib/postMetrics'
import {
  applyCommentReactionPatch,
  findCommentInTree,
  getVisibleCommentText,
  patchCommentTree,
  upsertCommentTree,
} from '@/lib/comments'
import { useMediaUpload } from '@/hooks/useMediaUpload'

const fetcher = swrFetcher

type MentionUser = {
  id: string
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  is_verified?: boolean
}

function getMentionHandle(user: MentionUser | Comment['user'] | null | undefined) {
  const raw = user?.username || user?.display_name || 'user'
  return String(raw).replace(/\s+/g, '')
}

function RichCommentText({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g)

  return (
    <p className="text-sm text-text leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, index) => (
        /^@[a-zA-Z0-9_]+$/.test(part)
          ? <span key={`${part}-${index}`} className="text-primary font-medium">{part}</span>
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </p>
  )
}

function CommentAttachment({ comment }: { comment: Comment }) {
  if (comment.gif_url) {
    return (
      <div className="mt-2 relative w-full max-w-sm rounded-2xl overflow-hidden border border-border bg-bg-card2">
        <img src={comment.gif_url} alt="GIF comment" className="w-full max-h-72 object-cover" loading="lazy" />
        <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
          GIF
        </span>
      </div>
    )
  }

  if (comment.video_url) {
    return (
      <div className="mt-2 w-full max-w-sm rounded-2xl overflow-hidden border border-border bg-black">
        <video
          src={comment.video_url}
          poster={comment.video_thumbnail_url || undefined}
          controls
          preload="metadata"
          playsInline
          className="w-full max-h-80"
        />
      </div>
    )
  }

  if (comment.image_url) {
    return (
      <div className="mt-2 w-full max-w-sm rounded-2xl overflow-hidden border border-border bg-bg-card2">
        <img src={comment.image_url} alt="Comment attachment" className="w-full max-h-80 object-cover" loading="lazy" />
      </div>
    )
  }

  return null
}

function GifPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      void searchGifs('trending')
      return
    }

    const timeout = setTimeout(() => {
      void searchGifs(query)
    }, 350)

    return () => clearTimeout(timeout)
  }, [query])

  async function searchGifs(q: string) {
    setLoading(true)
    try {
      const normalized = q === 'trending' ? '' : q
      const res = await fetch(`/api/gifs?q=${encodeURIComponent(normalized)}&limit=16`, { cache: 'no-store' })
      if (!res.ok) throw new Error('GIF search failed')
      const data = await res.json()
      setResults(Array.isArray(data?.data) ? data.data : [])
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs..."
          className="input-base text-sm flex-1"
        />
        <button onClick={onClose} className="text-text-muted hover:text-text p-1">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto">
          {results.map((url, index) => (
            <button
              key={`${url}-${index}`}
              onClick={() => onSelect(url)}
              className="rounded-lg overflow-hidden bg-bg-card2 aspect-square hover:opacity-80 transition-opacity"
            >
              <img src={url} alt="GIF option" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">
          No results found. Paste a GIF URL below if you already have one.
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={pasteUrl}
          onChange={(event) => setPasteUrl(event.target.value)}
          placeholder="Or paste GIF URL..."
          className="input-base text-xs flex-1"
        />
        {pasteUrl && (
          <button onClick={() => onSelect(pasteUrl)} className="btn-primary text-xs px-3 py-1.5">
            Use
          </button>
        )}
      </div>
      <p className="text-[10px] text-text-muted text-center">GIF suggestions</p>
    </div>
  )
}

function CommentItem({
  comment,
  depth = 0,
  reactingIds,
  onReply,
  onReact,
}: {
  comment: Comment
  depth?: number
  reactingIds: Record<string, boolean>
  onReply: (comment: Comment) => void
  onReact: (commentId: string, reaction: CommentReactionType) => void
}) {
  const displayName = comment.is_anonymous
    ? 'Anonymous'
    : (comment.user?.display_name || comment.user?.username || 'User')
  const visibleText = getVisibleCommentText(comment)
  const avatarSize = depth > 0 ? 24 : 32
  const isReacting = !!reactingIds[comment.id]

  return (
    <div className={cn(depth > 0 ? 'mt-3 ml-2 pl-3 border-l border-border' : 'py-3')}>
      <div className="flex gap-3">
        {comment.is_anonymous ? (
          <div
            className={cn(
              'rounded-full bg-bg-card2 flex items-center justify-center flex-shrink-0',
              depth > 0 ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
            )}
          >
            🕵️
          </div>
        ) : (
          <Link href={`/profile/${comment.user_id}`}>
            <Avatar user={comment.user} size={avatarSize} />
          </Link>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={cn('font-semibold', depth > 0 ? 'text-xs' : 'text-sm')}>{displayName}</span>
            <span className="text-xs text-text-muted">{getRelativeTime(comment.created_at)}</span>
          </div>

          {visibleText && <RichCommentText text={visibleText} />}
          <CommentAttachment comment={comment} />

          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
            <button
              onClick={() => onReply(comment)}
              className="text-text-muted hover:text-primary transition-colors"
            >
              Reply
            </button>
            <button
              onClick={() => onReact(comment.id, 'like')}
              disabled={isReacting}
              className={cn(
                'inline-flex items-center gap-1 transition-colors disabled:opacity-50',
                comment.user_reaction === 'like' ? 'text-primary font-semibold' : 'text-text-muted hover:text-text'
              )}
            >
              <ThumbsUp size={12} />
              <span>Like</span>
              {(comment.like_count || 0) > 0 && <span>{comment.like_count}</span>}
            </button>
            <button
              onClick={() => onReact(comment.id, 'dislike')}
              disabled={isReacting}
              className={cn(
                'inline-flex items-center gap-1 transition-colors disabled:opacity-50',
                comment.user_reaction === 'dislike' ? 'text-accent-red font-semibold' : 'text-text-muted hover:text-text'
              )}
            >
              <ThumbsDown size={12} />
              <span>Dislike</span>
              {(comment.dislike_count || 0) > 0 && <span>{comment.dislike_count}</span>}
            </button>
          </div>

          {comment.replies?.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              reactingIds={reactingIds}
              onReply={onReply}
              onReact={onReact}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PostPageClient({ id }: { id: string }) {
  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="text-text-muted hover:text-text transition-colors">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="font-bold">Post</h1>
          </div>
        </div>
        <main className="pb-nav">
          <PostContent postId={id} />
        </main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center gap-3">
            <Link href="/" className="text-text-muted hover:text-text transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-bold">Post</h1>
          </div>
          <div className="max-w-2xl mx-auto">
            <PostContent postId={id} />
          </div>
        </main>
      </div>
    </div>
  )
}

function PostContent({ postId }: { postId: string }) {
  const { profile, isLoggedIn } = useAuth()
  const router = useRouter()
  const pendingPost = usePendingPost(postId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { upload, progress: uploadProgress, statusText: uploadStatusText, reset: resetUpload, isUploading } = useMediaUpload()

  const { data: postData, isLoading: postLoading, error: postError, mutate: mutatePost } = useSWR(
    `/api/posts/${postId}`,
    fetcher,
    { revalidateOnFocus: true, errorRetryCount: 3, errorRetryInterval: 2000, dedupingInterval: 1000 }
  )
  const { data: commentsData, mutate: mutateComments } = useSWR(
    (postData?.data || pendingPost) ? `/api/posts/${postId}/comments` : null,
    fetcher
  )

  const [comment, setComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [loading, setLoading] = useState(false)
  const [manualRetries, setManualRetries] = useState(0)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [attachmentType, setAttachmentType] = useState<'image' | 'video' | 'gif' | null>(null)
  const [gifUrl, setGifUrl] = useState('')
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([])
  const [mentionedUsers, setMentionedUsers] = useState<MentionUser[]>([])
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [reactingIds, setReactingIds] = useState<Record<string, boolean>>({})

  const post = postData?.data ?? pendingPost ?? null
  const comments: Comment[] = commentsData?.data || []

  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    }
  }, [attachmentPreview])

  useEffect(() => {
    if (!post || !isLoggedIn) return
    fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ post_id: postId, action: 'dwell', dwell_ms: 5000 }]),
      keepalive: true,
    }).catch(() => {})
  }, [post?.id]) // eslint-disable-line

  useEffect(() => {
    if (!postId) return

    let timeout: ReturnType<typeof setTimeout> | null = null
    const refreshThread = () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        void mutateComments()
        void mutatePost()
      }, 180)
    }

    const channel = supabase
      .channel(`post-thread:${postId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`,
      }, () => {
        refreshThread()
      })
      .subscribe()

    const pollId = window.setInterval(() => {
      if (document.hidden || !navigator.onLine) return
      void mutateComments()
      void mutatePost()
    }, 8000)

    return () => {
      if (timeout) clearTimeout(timeout)
      window.clearInterval(pollId)
      supabase.removeChannel(channel)
    }
  }, [postId, mutateComments, mutatePost])

  useEffect(() => {
    if (!showMentionPicker) {
      setMentionResults([])
      return
    }

    if (!mentionQuery.trim()) {
      setMentionResults([])
      return
    }

    const timeout = setTimeout(() => {
      void searchMentions(mentionQuery)
    }, 180)

    return () => clearTimeout(timeout)
  }, [mentionQuery, showMentionPicker])

  function clearAttachment() {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentPreview(null)
    setAttachmentFile(null)
    setAttachmentType(null)
  }

  function clearComposer() {
    setComment('')
    setReplyTo(null)
    setGifUrl('')
    setShowGifPicker(false)
    setMentionQuery('')
    setMentionResults([])
    setMentionedUsers([])
    setShowMentionPicker(false)
    clearAttachment()
    resetUpload()
  }

  function handleAttachmentPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    clearAttachment()
    setGifUrl('')
    setShowGifPicker(false)
    setAttachmentFile(file)
    setAttachmentPreview(URL.createObjectURL(file))
    setAttachmentType(
      file.type === 'image/gif'
        ? 'gif'
        : file.type.startsWith('video/')
          ? 'video'
          : 'image'
    )
  }

  async function searchMentions(query: string) {
    if (query.length < 1) {
      setMentionResults([])
      return
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=people&limit=6`, { cache: 'no-store' })
      const data = await res.json()
      setMentionResults(data?.data?.people || [])
    } catch {
      setMentionResults([])
    }
  }

  function handleCommentChange(value: string) {
    const nextValue = value.slice(0, 500)
    setComment(nextValue)

    const lastAt = nextValue.lastIndexOf('@')
    if (lastAt === -1) {
      setShowMentionPicker(false)
      setMentionQuery('')
      return
    }

    const afterAt = nextValue.slice(lastAt + 1)
    if (/[\s\n]/.test(afterAt)) {
      setShowMentionPicker(false)
      setMentionQuery('')
      return
    }

    setShowMentionPicker(true)
    setMentionQuery(afterAt)
  }

  function pickMention(user: MentionUser) {
    const lastAt = comment.lastIndexOf('@')
    const handle = getMentionHandle(user)
    const before = lastAt >= 0 ? comment.slice(0, lastAt) : comment
    const nextValue = `${before}@${handle} `
    setComment(nextValue)
    setMentionedUsers((current) => current.some((item) => item.id === user.id) ? current : [...current, user])
    setShowMentionPicker(false)
    setMentionQuery('')
    setMentionResults([])
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function addMentionPrompt() {
    const spacer = comment && !comment.endsWith(' ') ? ' ' : ''
    const next = `${comment}${spacer}@`
    setComment(next)
    setShowMentionPicker(true)
    setMentionQuery('')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function removeMention(userId: string) {
    setMentionedUsers((current) => current.filter((user) => user.id !== userId))
  }

  function getActiveMentionIds(text: string) {
    return mentionedUsers
      .filter((user) => text.includes(`@${getMentionHandle(user)}`))
      .map((user) => user.id)
  }

  async function submitComment() {
    if (!isLoggedIn) {
      toast.error('Sign in to comment')
      return
    }

    if (!comment.trim() && !attachmentFile && !gifUrl) return
    if (loading || isUploading) return

    setLoading(true)
    try {
      const payload: Record<string, any> = {
        content: comment.trim(),
        parent_id: replyTo?.id || null,
        mentioned_user_ids: getActiveMentionIds(comment),
      }

      if (attachmentFile) {
        const uploaded = await upload(attachmentFile)
        if (!uploaded?.url) {
          throw new Error('Upload failed')
        }

        if (attachmentType === 'video') {
          payload.video_url = uploaded.url
          payload.video_thumbnail_url = uploaded.thumbnailUrl || null
        } else if (attachmentType === 'gif') {
          payload.gif_url = uploaded.url
        } else {
          payload.image_url = uploaded.url
        }
      } else if (gifUrl) {
        payload.gif_url = gifUrl
      }

      const response = await api.post<{ data: Comment }>(`/api/posts/${postId}/comments`, payload, { requireAuth: true })
      const createdComment = response.data

      if (createdComment) {
        mutateComments((current: any) => ({
          ...current,
          data: upsertCommentTree(current?.data || [], { ...createdComment, replies: createdComment.replies || [] }),
        }), false)

        mutatePost((current: any) => {
          if (!current?.data) return current
          return {
            ...current,
            data: {
              ...current.data,
              comment_count: (current.data.comment_count || 0) + 1,
              latest_comment: buildLatestCommentPreview(createdComment),
            },
          }
        }, false)

        incrementPostCommentEverywhere(postId, createdComment)
      }

      clearComposer()
      void mutateComments()
      void mutatePost()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function reactToComment(commentId: string, reaction: CommentReactionType) {
    if (!isLoggedIn) {
      toast.error('Sign in to react')
      return
    }

    if (reactingIds[commentId]) return

    const target = findCommentInTree(comments, commentId)
    if (!target) return

    const previousReaction = target.user_reaction ?? null
    const nextReaction = previousReaction === reaction ? null : reaction

    setReactingIds((current) => ({ ...current, [commentId]: true }))
    mutateComments((current: any) => ({
      ...current,
      data: patchCommentTree(current?.data || [], commentId, (item) =>
        applyCommentReactionPatch(item, previousReaction, nextReaction)
      ),
    }), false)

    try {
      const result = await api.post<{
        reaction: CommentReactionType | null
        like_count: number
        dislike_count: number
      }>(
        `/api/comments/${commentId}/like`,
        { reaction },
        { requireAuth: true }
      )

      mutateComments((current: any) => ({
        ...current,
        data: patchCommentTree(current?.data || [], commentId, (item) => ({
          ...item,
          like_count: Number(result.like_count || 0),
          dislike_count: Number(result.dislike_count || 0),
          user_reaction: result.reaction ?? null,
          user_liked: result.reaction === 'like',
        })),
      }), false)

      void mutateComments()
    } catch (err) {
      mutateComments((current: any) => ({
        ...current,
        data: patchCommentTree(current?.data || [], commentId, (item) =>
          applyCommentReactionPatch(item, nextReaction, previousReaction)
        ),
      }), false)
      toast.error(getErrorMessage(err))
    } finally {
      setReactingIds((current) => {
        const next = { ...current }
        delete next[commentId]
        return next
      })
    }
  }

  async function deletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return
    try {
      await api.delete(`/api/posts/${postId}`, { requireAuth: true })
      api.post('/api/upload/delete', { post_id: postId }, { requireAuth: true }).catch(() => {})
      removePendingPost(postId)
      toast.success('Post deleted')
      router.push('/')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (postLoading && !pendingPost) return <PostSkeleton />

  if ((postError || !post) && !pendingPost) {
    const errMsg = postError?.message || postError?.toString() || ''
    const is401 = errMsg.includes('401') || errMsg.includes('expired') || errMsg.includes('Unauthorized')
    const isTimeout = errMsg.includes('timed out') || errMsg.includes('408') || errMsg.includes('TIMEOUT')
    const isNetwork = errMsg.includes('Network') || errMsg.includes('OFFLINE') || errMsg.includes('fetch')
    const is404 = errMsg.includes('404') || errMsg.toLowerCase().includes('not found')
    const isRetryable = isTimeout || isNetwork || (!is404 && !is401)

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-8">
        <div className="text-4xl mb-4">{is401 ? '🔒' : isRetryable ? '⏳' : '😕'}</div>
        <h3 className="font-semibold mb-2">
          {is401 ? 'Session expired' : isRetryable ? 'Loading failed' : 'Post not found'}
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          {is401 ? 'Please refresh the page or sign in again.'
            : isRetryable ? 'Connection issue. Tap retry to try again.'
            : 'It may have been deleted.'}
        </p>
        <div className="flex gap-3">
          {is401 ? (
            <button onClick={() => window.location.reload()} className="btn-primary text-sm">Refresh page</button>
          ) : isRetryable ? (
            <button onClick={() => { setManualRetries((value) => value + 1); mutatePost() }} className="btn-primary text-sm">
              Retry {manualRetries > 0 ? `(${manualRetries})` : ''}
            </button>
          ) : null}
          <Link href="/" className="btn-primary text-sm opacity-70">Back to feed</Link>
        </div>
      </div>
    )
  }

  const isOwner = !!(profile && post.user_id === profile.id)
  const hasComposerContent = !!(comment.trim() || attachmentFile || gifUrl)

  return (
    <div>
      <div className="border-b border-border">
        <FeedCard post={post} showLatestCommentPreview={false} />
        {isOwner && (
          <div className="px-4 pb-3 flex justify-end">
            <button
              onClick={deletePost}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-red transition-colors"
            >
              <Trash2 size={13} /> Delete post
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border px-4 pt-2">
        {comments.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-12">No comments yet. Be the first!</p>
        ) : (
          comments.map((item) => (
            <CommentItem
              key={item.id}
              comment={item}
              reactingIds={reactingIds}
              onReply={setReplyTo}
              onReact={reactToComment}
            />
          ))
        )}
      </div>

      <div className="sticky bottom-16 lg:bottom-0 bg-bg/95 backdrop-blur-xl border-t border-border px-4 py-3">
        {showGifPicker && (
          <div className="mb-3">
            <GifPicker
              onSelect={(url) => {
                clearAttachment()
                setGifUrl(url)
                setShowGifPicker(false)
              }}
              onClose={() => setShowGifPicker(false)}
            />
          </div>
        )}

        {replyTo && (
          <div className="flex items-center justify-between mb-2 text-xs text-text-muted bg-bg-card2 px-3 py-1.5 rounded-lg">
            <span>Replying to @{getMentionHandle(replyTo.user || null)}</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-text">✕</button>
          </div>
        )}

        {(attachmentPreview || gifUrl) && (
          <div className="mb-3 rounded-2xl border border-border bg-bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-text-secondary">
                {gifUrl ? 'Selected GIF' : attachmentType === 'video' ? 'Selected video' : attachmentType === 'gif' ? 'Selected GIF file' : 'Selected photo'}
              </p>
              <button
                onClick={() => {
                  if (gifUrl) setGifUrl('')
                  else clearAttachment()
                }}
                className="text-text-muted hover:text-text"
              >
                <X size={14} />
              </button>
            </div>

            {gifUrl ? (
              <img src={gifUrl} alt="Selected GIF" className="w-full max-h-56 object-cover rounded-xl" />
            ) : attachmentPreview && attachmentType === 'video' ? (
              <video src={attachmentPreview} controls playsInline className="w-full max-h-56 rounded-xl bg-black" />
            ) : attachmentPreview ? (
              <img src={attachmentPreview} alt="Selected attachment" className="w-full max-h-56 object-cover rounded-xl" />
            ) : null}
          </div>
        )}

        {mentionedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {mentionedUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => removeMention(user.id)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs"
              >
                @{getMentionHandle(user)}
                <X size={12} />
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          {showMentionPicker && (
            <div className="absolute bottom-full left-11 right-0 mb-2 bg-bg-card border border-border rounded-2xl overflow-hidden shadow-xl z-50 max-h-56 overflow-y-auto">
              {mentionQuery.length < 1 ? (
                <p className="text-xs text-text-muted text-center py-3">Type a name to mention someone</p>
              ) : mentionResults.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-3">No users found</p>
              ) : (
                mentionResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => pickMention(user)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-bg-card2 transition-colors text-left"
                  >
                    <Avatar user={user as any} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{user.display_name || user.username}</p>
                      <p className="text-xs text-text-muted">@{getMentionHandle(user)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex items-end gap-3">
            <Avatar user={profile} size={32} />

            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={(event) => handleCommentChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void submitComment()
                  }
                }}
                placeholder={isLoggedIn ? 'Write a comment... use @ to mention' : 'Sign in to comment'}
                disabled={!isLoggedIn}
                rows={1}
                maxLength={500}
                className="input-base w-full resize-none rounded-2xl px-4 py-3 text-sm min-h-[46px] max-h-32 disabled:opacity-50"
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isLoggedIn || isUploading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text hover:border-border-active transition-colors disabled:opacity-50"
                  >
                    <ImagePlus size={13} />
                    Media
                  </button>
                  <button
                    onClick={() => setShowGifPicker((value) => !value)}
                    disabled={!isLoggedIn || isUploading}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50',
                      showGifPicker || !!gifUrl
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-border text-text-muted hover:text-text hover:border-border-active'
                    )}
                  >
                    <SmilePlus size={13} />
                    GIF
                  </button>
                  <button
                    onClick={addMentionPrompt}
                    disabled={!isLoggedIn}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text hover:border-border-active transition-colors disabled:opacity-50"
                  >
                    <AtSign size={13} />
                    Mention
                  </button>
                </div>
                <span className="text-[11px] text-text-muted">{comment.length}/500</span>
              </div>

              {isUploading && (
                <p className="mt-2 text-xs text-primary">
                  {uploadStatusText || `Uploading... ${uploadProgress}%`}
                </p>
              )}
            </div>

            <button
              onClick={() => void submitComment()}
              disabled={!hasComposerContent || loading || isUploading || !isLoggedIn}
              className="w-10 h-10 rounded-full bg-primary disabled:opacity-40 flex items-center justify-center text-white transition-opacity active:scale-95"
            >
              {loading || isUploading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleAttachmentPick}
            className="hidden"
          />
        </div>
      </div>
    </div>
  )
}
