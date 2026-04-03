export type DirectMessageAttachmentType = 'image' | 'video'

export interface DirectMessageAttachment {
  type: DirectMessageAttachmentType
  url: string
  thumbnail_url?: string | null
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function normalizeDirectMessageAttachments(message: any): DirectMessageAttachment[] {
  const next: DirectMessageAttachment[] = []
  const fromColumn = Array.isArray(message?.attachments) ? message.attachments : []

  for (const item of fromColumn) {
    if (!item || typeof item !== 'object') continue
    const type = item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : null
    const url = asText(item.url).trim()
    if (!type || !url) continue
    next.push({
      type,
      url,
      thumbnail_url: asText(item.thumbnail_url || '').trim() || null,
    })
  }

  if (next.length > 0) return next

  if (message?.image_url) {
    next.push({ type: 'image', url: message.image_url, thumbnail_url: null })
  }
  if (message?.video_url) {
    next.push({
      type: 'video',
      url: message.video_url,
      thumbnail_url: asText(message?.video_thumbnail_url || '').trim() || null,
    })
  }

  return next
}

export function isDirectMessageDeletedForEveryone(message: any) {
  return Boolean(message?.deleted_for_everyone || (message?.is_deleted && !message?.deleted_for_sender && !message?.deleted_for_receiver))
}

export function getDirectMessagePreview(message: any, viewerId?: string | null) {
  if (!message) return ''
  if (isDirectMessageDeletedForEveryone(message)) {
    return viewerId && message?.deleted_by === viewerId ? 'You removed a message' : 'Message removed'
  }

  const content = asText(message.content).trim()
  if (content) return content

  const attachments = normalizeDirectMessageAttachments(message)
  if (attachments.length === 0) return ''

  const imageCount = attachments.filter((item) => item.type === 'image').length
  const videoCount = attachments.filter((item) => item.type === 'video').length

  if (attachments.length === 1) {
    return attachments[0].type === 'video' ? '🎥 Video' : '📷 Photo'
  }
  if (imageCount && !videoCount) return `📷 ${imageCount} photos`
  if (videoCount && !imageCount) return `🎥 ${videoCount} videos`
  return `📎 ${attachments.length} attachments`
}
