import type { Comment, CommentReactionType, PostCommentPreview } from '@/types'

export const COMMENT_ATTACHMENT_SENTINEL = '[comment_attachment]'

type CommentLike = Pick<Comment, 'content' | 'image_url' | 'video_url' | 'gif_url'> | Pick<PostCommentPreview, 'content' | 'image_url' | 'video_url' | 'gif_url'>

export function getStoredCommentContent(content: string | null | undefined, hasAttachment: boolean) {
  const trimmed = String(content || '').trim()
  if (trimmed) return trimmed
  return hasAttachment ? COMMENT_ATTACHMENT_SENTINEL : ''
}

export function isAttachmentOnlyCommentContent(content: string | null | undefined) {
  return String(content || '') === COMMENT_ATTACHMENT_SENTINEL
}

export function getVisibleCommentText(comment: CommentLike | null | undefined) {
  if (!comment) return ''
  return isAttachmentOnlyCommentContent(comment.content) ? '' : String(comment.content || '')
}

export function getCommentSummary(comment: CommentLike | null | undefined) {
  if (!comment) return ''
  const text = getVisibleCommentText(comment).trim()
  if (text) return text
  if (comment.gif_url) return 'Shared a GIF'
  if (comment.video_url) return 'Shared a video'
  if (comment.image_url) return 'Shared a photo'
  return ''
}

export function upsertCommentTree(existing: Comment[], incoming: Comment): Comment[] {
  const next = [...existing]

  if (!incoming.parent_id) {
    const alreadyExists = next.some((comment) => comment.id === incoming.id)
    if (alreadyExists) {
      return next.map((comment) => comment.id === incoming.id
        ? { ...comment, ...incoming, replies: incoming.replies || comment.replies || [] }
        : comment)
    }

    next.push({ ...incoming, replies: incoming.replies || [] })
    return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  return next.map((comment) => {
    if (comment.id !== incoming.parent_id) return comment
    const replies = comment.replies || []
    const existingReply = replies.some((reply) => reply.id === incoming.id)
    const nextReplies = existingReply
      ? replies.map((reply) => reply.id === incoming.id ? { ...reply, ...incoming } : reply)
      : [...replies, incoming]

    return {
      ...comment,
      replies: nextReplies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }
  })
}

export function patchCommentTree(
  existing: Comment[],
  commentId: string,
  updater: (comment: Comment) => Comment
): Comment[] {
  return existing.map((comment) => {
    if (comment.id === commentId) {
      return updater(comment)
    }

    if (comment.replies?.length) {
      return {
        ...comment,
        replies: patchCommentTree(comment.replies, commentId, updater),
      }
    }

    return comment
  })
}

export function findCommentInTree(existing: Comment[], commentId: string): Comment | null {
  for (const comment of existing) {
    if (comment.id === commentId) return comment
    if (comment.replies?.length) {
      const nested = findCommentInTree(comment.replies, commentId)
      if (nested) return nested
    }
  }

  return null
}

export function applyCommentReactionPatch(
  comment: Comment,
  previousReaction: CommentReactionType | null | undefined,
  nextReaction: CommentReactionType | null | undefined
) {
  const nextLikeCount = Math.max(
    0,
    (comment.like_count || 0)
      - (previousReaction === 'like' ? 1 : 0)
      + (nextReaction === 'like' ? 1 : 0)
  )

  const nextDislikeCount = Math.max(
    0,
    (comment.dislike_count || 0)
      - (previousReaction === 'dislike' ? 1 : 0)
      + (nextReaction === 'dislike' ? 1 : 0)
  )

  return {
    ...comment,
    like_count: nextLikeCount,
    dislike_count: nextDislikeCount,
    user_reaction: nextReaction ?? null,
    user_liked: nextReaction === 'like',
  }
}
