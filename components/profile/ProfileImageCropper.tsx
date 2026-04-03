'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RotateCcw, ZoomIn, ZoomOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type CropKind = 'avatar' | 'cover'

const CROP_CONFIG: Record<CropKind, {
  label: string
  aspect: number
  outputWidth: number
  outputHeight: number
  frameClassName: string
}> = {
  avatar: {
    label: 'Profile photo',
    aspect: 1,
    outputWidth: 720,
    outputHeight: 720,
    frameClassName: 'aspect-square max-w-[320px] rounded-full',
  },
  cover: {
    label: 'Cover photo',
    aspect: 3,
    outputWidth: 1800,
    outputHeight: 600,
    frameClassName: 'aspect-[3/1] max-w-[420px] rounded-3xl',
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function ProfileImageCropper({
  kind,
  file,
  onClose,
  onApply,
}: {
  kind: CropKind
  file: File
  onClose: () => void
  onApply: (file: File, previewUrl: string) => Promise<void> | void
}) {
  const config = CROP_CONFIG[kind]
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isReady, setIsReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function getMetrics(nextZoom = zoom) {
    const frame = frameRef.current
    if (!frame) return null
    const frameWidth = frame.clientWidth
    const frameHeight = frame.clientHeight
    const baseScale = Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height)
    const scale = baseScale * nextZoom
    const width = naturalSize.width * scale
    const height = naturalSize.height * scale
    return { frameWidth, frameHeight, scale, width, height }
  }

  function centerImage(nextZoom = zoom) {
    const metrics = getMetrics(nextZoom)
    if (!metrics) return
    setPosition({
      x: (metrics.frameWidth - metrics.width) / 2,
      y: (metrics.frameHeight - metrics.height) / 2,
    })
  }

  function clampPosition(next: { x: number; y: number }, nextZoom = zoom) {
    const metrics = getMetrics(nextZoom)
    if (!metrics) return next

    return {
      x: clamp(next.x, Math.min(0, metrics.frameWidth - metrics.width), 0),
      y: clamp(next.y, Math.min(0, metrics.frameHeight - metrics.height), 0),
    }
  }

  function handleImageLoad() {
    const image = imgRef.current
    if (!image) return
    setNaturalSize({
      width: image.naturalWidth || image.width || 1,
      height: image.naturalHeight || image.height || 1,
    })
    setZoom(1)
    setIsReady(true)
    requestAnimationFrame(() => centerImage(1))
  }

  function updateZoom(nextZoom: number) {
    const safeZoom = clamp(nextZoom, 1, 2.8)
    const previousMetrics = getMetrics(zoom)
    const nextMetrics = getMetrics(safeZoom)

    if (!previousMetrics || !nextMetrics) {
      setZoom(safeZoom)
      return
    }

    const centerX = previousMetrics.frameWidth / 2
    const centerY = previousMetrics.frameHeight / 2
    const focusX = (centerX - position.x) / previousMetrics.scale
    const focusY = (centerY - position.y) / previousMetrics.scale
    const nextPosition = clampPosition({
      x: centerX - focusX * nextMetrics.scale,
      y: centerY - focusY * nextMetrics.scale,
    }, safeZoom)

    setZoom(safeZoom)
    setPosition(nextPosition)
  }

  async function handleApply() {
    const image = imgRef.current
    const metrics = getMetrics()
    if (!image || !metrics) return

    setSaving(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = config.outputWidth
      canvas.height = config.outputHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')

      const srcX = Math.max(0, -position.x / metrics.scale)
      const srcY = Math.max(0, -position.y / metrics.scale)
      const srcW = metrics.frameWidth / metrics.scale
      const srcH = metrics.frameHeight / metrics.scale

      ctx.drawImage(
        image,
        srcX, srcY, srcW, srcH,
        0, 0, config.outputWidth, config.outputHeight
      )

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.92)
      })
      if (!blob) throw new Error('Failed to export image')

      const outputFile = new File(
        [blob],
        `${kind}-${Date.now()}.jpg`,
        { type: 'image/jpeg' }
      )
      const outputPreviewUrl = URL.createObjectURL(blob)
      await onApply(outputFile, outputPreviewUrl)
      onClose()
    } catch {
      // Parent shows the toast/error. Keep the editor open so the user can retry.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[220] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-bg-card border border-border rounded-[28px] p-4 sm:p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-base">{config.label}</h3>
            <p className="text-xs text-text-muted">Drag to position it just the way you want.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-[28px] bg-black/70 border border-white/10 p-3 sm:p-4">
          <div
            ref={frameRef}
            className={cn(
              'relative mx-auto w-full overflow-hidden bg-black/80 touch-none',
              config.frameClassName
            )}
            onPointerDown={(event) => {
              if (!isReady) return
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                left: position.x,
                top: position.y,
              }
              ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!dragRef.current) return
              const deltaX = event.clientX - dragRef.current.x
              const deltaY = event.clientY - dragRef.current.y
              setPosition(clampPosition({
                x: dragRef.current.left + deltaX,
                y: dragRef.current.top + deltaY,
              }))
            }}
            onPointerUp={(event) => {
              dragRef.current = null
              ;(event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId)
            }}
            onPointerCancel={() => {
              dragRef.current = null
            }}
          >
            <img
              ref={imgRef}
              src={previewUrl}
              alt={config.label}
              onLoad={handleImageLoad}
              className="absolute select-none max-w-none"
              style={{
                left: position.x,
                top: position.y,
                width: getMetrics()?.width || 'auto',
                height: getMetrics()?.height || 'auto',
              }}
              draggable={false}
            />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center text-white/80">
                <Loader2 size={22} className="animate-spin" />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => updateZoom(zoom - 0.15)}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-text"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={1}
            max={2.8}
            step={0.01}
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            className="flex-1 accent-primary"
          />
          <button
            onClick={() => updateZoom(zoom + 0.15)}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-text"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => {
              setZoom(1)
              centerImage(1)
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-text-muted hover:text-text"
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!isReady || saving}
            className="btn-primary px-5 py-2.5 text-sm font-bold flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
