'use client'

/**
 * OptimizedImage — Smart image component
 * 
 * Features:
 * - Progressive loading with blur placeholder
 * - Error fallback with gradient
 * - Lazy loading by default
 * - next/image optimization
 * - Fade-in on load
 */

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface Props {
  src: string | null | undefined
  alt: string
  width?: number
  height?: number
  fill?: boolean
  className?: string
  priority?: boolean
  aspectRatio?: string
  fallbackText?: string
}

const BLUR_DATA = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTJlIi8+PC9zdmc+"

export default function OptimizedImage({
  src, alt, width, height, fill, className, priority, aspectRatio = '16/9', fallbackText
}: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={cn(
          'bg-gradient-to-br from-primary/20 to-accent-purple/20 flex items-center justify-center',
          className
        )}
        style={aspectRatio && !fill ? { aspectRatio } : undefined}
      >
        {fallbackText && (
          <span className="text-text-muted text-xs font-semibold">{fallbackText}</span>
        )}
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden', !fill && 'w-full')} style={fill ? undefined : { aspectRatio }}>
      {/* Blur skeleton while loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-bg-card2 animate-pulse" />
      )}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        fill={fill}
        priority={priority}
        placeholder="blur"
        blurDataURL={BLUR_DATA}
        className={cn(
          'transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          fill ? 'object-cover' : 'w-full h-auto',
          className
        )}
        sizes="(max-width:640px) 100vw, (max-width:1024px) 600px, 600px"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}
