'use client'

import { useState, useCallback } from 'react'
import {
  compressImage,
  validateVideo,
  generateVideoThumbnail,
  formatBytes,
  type CompressResult,
  type VideoMeta,
} from '@/lib/media'
import { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from '@/lib/media-constants'
import toast from 'react-hot-toast'

export type UploadState = 'idle' | 'compressing' | 'validating' | 'uploading' | 'done' | 'error'

export interface UploadResult {
  url:           string
  thumbnailUrl?: string
  mediaType:     'image' | 'video'
  width?:        number
  height?:       number
  duration?:     number
  originalSize:  number
  uploadedSize:  number
}

export function useMediaUpload() {
  const [state,      setState]      = useState<UploadState>('idle')
  const [progress,   setProgress]   = useState(0)
  const [statusText, setStatusText] = useState('')

  const reset = useCallback(() => {
    setState('idle')
    setProgress(0)
    setStatusText('')
  }, [])

  const upload = useCallback(async (file: File): Promise<UploadResult | null> => {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type as any)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type as any) || file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      toast.error('Unsupported file type. Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV.')
      setState('error')
      return null
    }

    let fileToUpload: File = file
    let compressInfo: CompressResult | null = null
    let videoMeta: VideoMeta | null = null

    try {
      if (isImage) {
        setState('compressing')
        setStatusText('Compressing image…')
        setProgress(10)
        try {
          compressInfo = await compressImage(file)
          fileToUpload = compressInfo.file
          if (compressInfo.savedPercent > 5) {
            setStatusText(`Compressed ${compressInfo.savedPercent}% · ${formatBytes(compressInfo.originalSize)} → ${formatBytes(compressInfo.compressedSize)}`)
          }
        } catch (compressErr: any) {
          // If compression fails (e.g. HEIC on unsupported browser), upload original
          console.warn('[upload] compression failed, using original:', compressErr.message)
          fileToUpload = file
        }
        setProgress(30)
      }

      if (isVideo) {
        setState('validating')
        setStatusText('Validating video…')
        setProgress(10)
        const result = await validateVideo(file)
        if (!result.ok) {
          toast.error(result.error || 'Invalid video')
          setState('error')
          return null
        }
        videoMeta = result.meta!
        setStatusText(`${Math.round(videoMeta.duration)}s · ${videoMeta.width}×${videoMeta.height} · ${formatBytes(file.size)}`)
        setProgress(20)
      }

      setState('uploading')
      setStatusText('Uploading…')
      setProgress(isImage ? 40 : 30)

      const { uploadToImageKit } = await import('@/lib/upload')

      const onProgress = (p: { percent: number }) => {
        const start = isImage ? 40 : 30
        setProgress(start + Math.round(p.percent * (93 - start) / 100))
        setStatusText(`Uploading… ${p.percent}%`)
      }

      const result = await uploadToImageKit(
        fileToUpload,
        isImage ? 'images' : 'videos',
        onProgress
      )
      if (!result?.url) throw new Error('Upload returned no URL')

      setProgress(95)

      let thumbnailUrl: string | undefined
      if (isVideo) {
        setStatusText('Generating thumbnail…')
        try {
          const thumbFile = await generateVideoThumbnail(file)
          if (thumbFile) {
            const thumbResult = await uploadToImageKit(thumbFile, 'images')
            if (thumbResult?.url) thumbnailUrl = thumbResult.url
          }
        } catch { /* thumbnail optional */ }
      }

      setProgress(100)
      setStatusText('Done!')
      setState('done')

      return {
        url:          result.url,
        thumbnailUrl,
        mediaType:    isImage ? 'image' : 'video',
        width:        compressInfo?.width  ?? videoMeta?.width,
        height:       compressInfo?.height ?? videoMeta?.height,
        duration:     videoMeta?.duration,
        originalSize: file.size,
        uploadedSize: fileToUpload.size,
      }
    } catch (err: any) {
      setState('error')
      setStatusText('')
      toast.error(err.message || 'Upload failed. Please try again.')
      return null
    }
  }, [])

  return {
    upload,
    state,
    progress,
    statusText,
    reset,
    isUploading: (['compressing', 'validating', 'uploading'] as UploadState[]).includes(state),
  }
}
