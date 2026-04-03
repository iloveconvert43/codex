'use client'

import { Globe, MapPin, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PostScope = 'global' | 'nearby' | 'city'

interface Props {
  value: PostScope
  onChange: (scope: PostScope) => void
  city?: string | null
  hasLocation?: boolean
}

const SCOPES: {
  value: PostScope
  icon: React.ReactNode
  label: string
  desc: string
}[] = [
  {
    value: 'global',
    icon: <Globe size={15} />,
    label: 'Everyone',
    desc: 'Visible to all tryHushly users worldwide' },
  {
    value: 'nearby',
    icon: <MapPin size={15} />,
    label: 'Nearby only',
    desc: 'Only people within 10km can see this' },
  {
    value: 'city',
    icon: <Building2 size={15} />,
    label: 'My city',
    desc: 'Only people in your city can see this' },
]

export default function PostScopeSelector({ value, onChange, city, hasLocation }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Who can see this?</p>
      <div className="grid grid-cols-3 gap-2">
        {SCOPES.map(scope => {
          const disabled = scope.value === 'nearby' && !hasLocation
          const isSelected = value === scope.value

          return (
            <button
              key={scope.value}
              onClick={() => !disabled && onChange(scope.value)}
              disabled={disabled}
              title={disabled ? 'Enable location to post nearby' : scope.desc}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all',
                isSelected
                  ? 'border-primary bg-primary-muted text-primary'
                  : 'border-border text-text-secondary hover:border-border-active',
                disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className={cn(isSelected ? 'text-primary' : 'text-text-muted')}>
                {scope.icon}
              </span>
              <span className="text-xs font-bold">{scope.label}</span>
              {scope.value === 'city' && city && (
                <span className="text-[9px] text-text-muted leading-tight">{city}</span>
              )}
            </button>
          )
        })}
      </div>
      {value === 'nearby' && !hasLocation && (
        <p className="text-xs text-yellow-400 flex items-center gap-1">
          <MapPin size={10} /> Enable location to post as Nearby
        </p>
      )}
    </div>
  )
}
