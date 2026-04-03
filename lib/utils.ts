import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m away`
  if (km < 10) return `${km.toFixed(1)}km away`
  return `${Math.round(km)}km away`
}

export function getRelativeTime(date: string | Date): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (secs < 60) return 'just now'
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  if (weeks < 4) return `${weeks}w`
  return past.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export const REACTION_CONFIG = {
  interesting: { emoji: '🤔', label: 'Interesting', color: '#6C63FF' },
  funny:       { emoji: '😂', label: 'Funny',       color: '#FFD93D' },
  deep:        { emoji: '🌊', label: 'Deep',         color: '#4FACFE' },
  curious:     { emoji: '🤩', label: 'Wow',          color: '#FF6B6B' } } as const

export type ReactionType = keyof typeof REACTION_CONFIG

export const REACTION_ORDER: ReactionType[] = ['interesting', 'curious', 'funny', 'deep']
