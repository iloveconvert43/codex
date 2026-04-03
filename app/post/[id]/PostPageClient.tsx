'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'

import Link from 'next/link'
import { ArrowLeft, Send, Loader2, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getRelativeTime } from '@/lib/utils'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import FeedCard from '@/components/feed/FeedCard'
import Avatar from '@/components/ui/Avatar'
import { PostSkeleton } from '@/components/ui/Skeleton'
import toast from 'react-hot-toast'
import { analytics } from '@/lib/analytics'
import type { Comment } from '@/types'
import { usePendingPost } from '@/hooks/usePendingPosts'
import { removePendingPost } from '@/lib/pendingPosts'
import { supabase } from '@/lib/supabase'

type CommentFeedPage = {
  data?: Comment[]
}

function upsertCommentTree(existing: Comment[], incoming: Comment) {
  const next = [...existing]

  if (!incoming.parent_id) {
    const alreadyExists = next.some((comment) => comment.id === incoming.id)
    if (alreadyExists) return next
    next.push({ ...incoming, replies: incoming.replies || [] })
    return next
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  return next.map((comment) => {
    if (comment.id !== incoming.parent_id) return comment
    const replies = comment.replies || []
    if (replies.some((reply) => reply.id === incoming.id)) return comment
    return {
      ...comment,
      replies: [...replies, incoming].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }
  })
}

function updateFeedCachesForComment(postId: string, createdComment: Comment) {
  mutate(
    (key: unknown) => typeof key === 'string' && key.startsWith('/api/feed'),
    (pages: CommentFeedPage[] | undefined) => {
      if (!pages) return pages
      return pages.map((page: any) => ({
        ...page,
        data: (page.data || []).map((post: any) => (
          post.id !== postId
            ? post
            : {
                ...post,
                comment_count: (post.comment_count || 0) + 1,
                latest_comment: createdComment.is_anonymous
                  ? {
                      id: createdComment.id,
                      post_id: createdComment.post_id,
                      user_id: createdComment.user_id,
                      parent_id: createdComment.parent_id,
                      content: createdComment.content,
                      created_at: createdComment.created_at,
                      is_anonymous: true,
                      user: null,
                    }
                  : {
                      id: createdComment.id,
                      post_id: createdComment.post_id,
                      user_id: createdComment.user_id,
                      parent_id: createdComment.parent_id,
                      content: createdComment.content,
                      created_at: createdComment.created_at,
                      is_anonymous: false,
                      user: createdComment.user || null,
                    },
              }
        )),
      }))
    },
    false
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

  const post = postData?.data ?? pendingPost ?? null
  const comments: Comment[] = commentsData?.data || []

  // Signal: opening a post detail = strong positive intent (weight 1.5)
  useEffect(() => {
    if (!post || !isLoggedIn) return
    fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ post_id: postId, action: 'dwell', dwell_ms: 5000 }]),
      keepalive: true
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

    return () => {
      if (timeout) clearTimeout(timeout)
      supabase.removeChannel(channel)
    }
  }, [postId, mutateComments, mutatePost])

  async function submitComment() {
    if (!comment.trim()) return
    if (!isLoggedIn) { toast.error('Sign in to comment'); return }
    setLoading(true)
    try {
      const response = await api.post<{ data: Comment }>(`/api/posts/${postId}/comments`, {
        content: comment.trim(),
        parent_id: replyTo?.id || null }, { requireAuth: true })
      const createdComment = response.data
      setComment('')
      setReplyTo(null)

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
              latest_comment: {
                id: createdComment.id,
                post_id: createdComment.post_id,
                user_id: createdComment.user_id,
                parent_id: createdComment.parent_id,
                content: createdComment.content,
                created_at: createdComment.created_at,
                is_anonymous: createdComment.is_anonymous,
                user: createdComment.user || null,
              },
            },
          }
        }, false)

        updateFeedCachesForComment(postId, createdComment)
      }

      void mutateComments()
      void mutatePost()
    } catch {
      toast.error('Could not post comment')
    } finally {
      setLoading(false)
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
            <button onClick={() => { setManualRetries(r => r + 1); mutatePost() }}
              className="btn-primary text-sm">
              Retry {manualRetries > 0 ? `(${manualRetries})` : ''}
            </button>
          ) : null}
          <Link href="/" className="btn-primary text-sm opacity-70">Back to feed</Link>
        </div>
      </div>
    )
  }

  const isOwner = profile && post.user_id === profile.id

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

      {/* Comments list */}
      <div className="divide-y divide-border px-4 pt-2">
        {comments.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-12">No comments yet. Be the first!</p>
        ) : (
          comments.map((c) => (
            <CommentItem key={c.id} comment={c} onReply={setReplyTo} />
          ))
        )}
      </div>

      {/* Comment input */}
      <div className="sticky bottom-16 lg:bottom-0 bg-bg/95 backdrop-blur-xl border-t border-border px-4 py-3">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 text-xs text-text-muted bg-bg-card2 px-3 py-1.5 rounded-lg">
            <span>Replying to @{replyTo.user?.username || 'someone'}</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-text">✕</button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Avatar user={profile} size={32} />
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submitComment()}
            placeholder={isLoggedIn ? 'Write a comment…' : 'Sign in to comment'}
            disabled={!isLoggedIn}
            maxLength={500}
            className="flex-1 bg-bg-card2 border border-border rounded-full px-4 py-2 text-sm outline-none focus:border-primary transition-colors placeholder:text-text-muted disabled:opacity-50"
          />
          <button
            onClick={submitComment}
            disabled={!comment.trim() || loading || !isLoggedIn}
            className="w-8 h-8 rounded-full bg-primary disabled:opacity-40 flex items-center justify-center text-white transition-opacity active:scale-95"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function CommentItem({ comment, onReply }: { comment: Comment; onReply: (c: Comment) => void }) {
  const displayName = comment.is_anonymous
    ? 'Anonymous'
    : (comment.user?.display_name || comment.user?.username || 'User')

  return (
    <div className="py-3">
      <div className="flex gap-3">
        {comment.is_anonymous ? (
          <div className="w-8 h-8 rounded-full bg-bg-card2 flex items-center justify-center text-sm flex-shrink-0">🕵️</div>
        ) : (
          <Link href={`/profile/${comment.user_id}`}>
            <Avatar user={comment.user} size={32} />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold">{displayName}</span>
            <span className="text-xs text-text-muted">{getRelativeTime(comment.created_at)}</span>
          </div>
          <p className="text-sm text-text leading-relaxed break-words">{comment.content}</p>
          <button
            onClick={() => onReply(comment)}
            className="text-xs text-text-muted hover:text-primary mt-1 transition-colors"
          >
            Reply
          </button>
          {comment.replies?.map((reply) => (
            <div key={reply.id} className="flex gap-2 mt-3 ml-2 pl-3 border-l border-border">
              {reply.is_anonymous ? (
                <div className="w-6 h-6 rounded-full bg-bg-card2 flex items-center justify-center text-xs flex-shrink-0">🕵️</div>
              ) : (
                <Link href={`/profile/${reply.user_id}`}>
                  <Avatar user={reply.user} size={24} />
                </Link>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">
                    {reply.is_anonymous ? 'Anonymous' : (reply.user?.display_name || reply.user?.username)}
                  </span>
                  <span className="text-xs text-text-muted">{getRelativeTime(reply.created_at)}</span>
                </div>
                <p className="text-sm text-text leading-relaxed break-words">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
