'use client'

import { useState } from 'react'
import { Globe, Navigation, Building2, Users, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import CitySelector from './CitySelector'
import { useAuth } from '@/hooks/useAuth'
import { useLocation } from '@/hooks/useLocation'

type Filter = 'global' | 'nearby' | 'city' | 'friends' | 'room'

interface Props {
  active: Filter
  onChange: (f: Filter, city?: string) => void
  selectedCity?: string | null
  roomSlug?: string
}

const TABS = [
  {
    value: 'global' as Filter,
    label: 'For You',
    icon: Globe,
    desc: 'Best posts from everyone'
  },
  {
    value: 'nearby' as Filter,
    label: 'Nearby',
    icon: Navigation,
    desc: 'Posts from people near you'
  },
  {
    value: 'city' as Filter,
    label: 'City',
    icon: Building2,
    desc: 'Posts from your city'
  },
]

export default function FilterBar({ active, onChange, selectedCity, roomSlug }: Props) {
  const [showCityPicker, setShowCityPicker] = useState(false)
  const { profile } = useAuth()
  const { area, city: locCity } = useLocation()

  function handleTab(val: Filter) {
    if (val === 'city') {
      if (active === 'city') {
        setShowCityPicker(true)
      } else {
        onChange('city', selectedCity || profile?.city || locCity || undefined)
        if (!selectedCity && !profile?.city && !locCity) setShowCityPicker(true)
      }
    } else {
      onChange(val)
    }
  }

  return (
    <>
      {/* ── 3-section tab bar ── */}
      <div className="border-b border-border bg-bg sticky top-[57px] z-30">
        <div className="flex">
          {TABS.map(({ value, label, icon: Icon }) => {
            const isActive = active === value
            const showCity = value === 'city' && isActive && (selectedCity || profile?.city || locCity)
            const cityName = selectedCity || profile?.city || locCity

            return (
              <button
                key={value}
                onClick={() => handleTab(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 px-2 relative transition-colors',
                  isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="text-[13px] font-semibold leading-none">
                    {showCity ? (
                      <span className="flex items-center gap-0.5">
                        {String(cityName).slice(0, 12)}{String(cityName).length > 12 ? '…' : ''}
                        <ChevronDown size={10} />
                      </span>
                    ) : label}
                  </span>
                </div>

                {/* Active indicator line */}
                <div className={cn(
                  'absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full transition-all duration-200',
                  isActive ? 'w-8 bg-primary' : 'w-0 bg-transparent'
                )} />
              </button>
            )
          })}

          {/* Friends tab */}
          <button
            onClick={() => onChange('friends')}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-3 px-2 relative transition-colors',
              active === 'friends' ? 'text-primary' : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <div className="flex items-center gap-1.5">
              <Users size={15} strokeWidth={active === 'friends' ? 2.5 : 1.8} />
              <span className="text-[13px] font-semibold">Friends</span>
            </div>
            <div className={cn(
              'absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full transition-all duration-200',
              active === 'friends' ? 'w-8 bg-primary' : 'w-0 bg-transparent'
            )} />
          </button>
        </div>
      </div>

      {/* City picker modal */}
      {showCityPicker && (
        <CitySelector
          selectedCity={selectedCity || null}
          onSelect={city => { onChange('city', city); setShowCityPicker(false) }}
          userCity={profile?.city || locCity}
          onClose={() => setShowCityPicker(false)}
        />
      )}
    </>
  )
}
