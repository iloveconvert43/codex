import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import type { User } from '@/types'

interface AvatarProps {
  user?: User | null
  size?: number
  className?: string
}

const GRADIENT_COLORS = [
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
]

function getGradient(id?: string | null) {
  if (!id) return GRADIENT_COLORS[0]
  const i = id.charCodeAt(0) % GRADIENT_COLORS.length
  return GRADIENT_COLORS[i]
}

export default function Avatar({ user, size = 40, className = '' }: AvatarProps) {
  const s = `${size}px`

  if (user?.avatar_url) {
    return (
      <Image
        src={user.avatar_url}
        alt={user.display_name || 'User'}
        width={size}
        height={size}
        className={`rounded-full object-cover border border-border ${className}`}
        style={{ width: s, height: s, minWidth: s }}
      />
    )
  }

  const initials = getInitials(user?.display_name || user?.username)
  const gradient = getGradient(user?.id)

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold border border-border ${className}`}
      style={{ width: s, height: s, minWidth: s, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}
