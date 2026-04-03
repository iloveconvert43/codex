'use client'

import { useState, useMemo } from 'react'
import { Search, Building2, Check, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CITY_NAMES } from '@/lib/india-cities'

interface Props {
  selectedCity: string | null
  onSelect: (city: string) => void
  userCity?: string | null
  onClose: () => void
}

// Group cities by state for organized display
const CITIES_BY_STATE = CITY_NAMES.reduce((acc, c) => {
  if (!acc[c.state]) acc[c.state] = []
  acc[c.state].push(c)
  return acc
}, {} as Record<string, typeof CITY_NAMES>)

const STATES_SORTED = Object.keys(CITIES_BY_STATE).sort()

// Popular cities to show first
const POPULAR = [
  'Mumbai','Delhi','Bangalore','Hyderabad','Chennai',
  'Kolkata','Pune','Ahmedabad','Jaipur','Surat',
  'Lucknow','Kanpur','Nagpur','Visakhapatnam','Indore',
  'Bhopal','Patna','Chandigarh','Kochi','Coimbatore'
]

export default function CitySelector({ selectedCity, onSelect, userCity, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'popular' | 'all'>('popular')

  const filtered = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return CITY_NAMES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    ).slice(0, 20)
  }, [query])

  const popularCities = CITY_NAMES.filter(c => POPULAR.includes(c.name))

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end lg:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-base flex items-center gap-2">
              <Building2 size={18} className="text-primary" />
              Select City
            </h3>
            <button onClick={onClose} className="text-text-muted hover:text-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-card2 transition-colors">
              ✕
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search any city in India…"
              className="input-base pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 hide-scrollbar">
          {/* User's city */}
          {userCity && !query && (
            <>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-4 pt-3 pb-1">
                Your City
              </p>
              <CityRow
                name={userCity} state="From your profile" emoji="📍"
                selected={selectedCity === userCity}
                onSelect={() => { onSelect(userCity); onClose() }}
              />
              <div className="h-px bg-border mx-4" />
            </>
          )}

          {/* Search results */}
          {query && (
            <>
              {filtered.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-muted">No cities found for "{query}"</p>
                  <p className="text-xs text-text-muted mt-1">Try a different spelling</p>
                </div>
              ) : (
                filtered.map(city => (
                  <CityRow
                    key={city.name}
                    name={city.name} state={city.state}
                    selected={selectedCity === city.name}
                    onSelect={() => { onSelect(city.name); onClose() }}
                  />
                ))
              )}
            </>
          )}

          {/* Tabs when not searching */}
          {!query && (
            <>
              <div className="flex px-4 pt-3 pb-0 gap-2">
                <button
                  onClick={() => setTab('popular')}
                  className={cn('flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors',
                    tab === 'popular' ? 'bg-primary text-white' : 'text-text-muted hover:text-text')}
                >
                  Popular
                </button>
                <button
                  onClick={() => setTab('all')}
                  className={cn('flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors',
                    tab === 'all' ? 'bg-primary text-white' : 'text-text-muted hover:text-text')}
                >
                  All Cities ({CITY_NAMES.length})
                </button>
              </div>

              {tab === 'popular' && (
                <div className="pt-2 pb-2">
                  {popularCities.map(city => (
                    <CityRow
                      key={city.name}
                      name={city.name} state={city.state}
                      selected={selectedCity === city.name}
                      onSelect={() => { onSelect(city.name); onClose() }}
                    />
                  ))}
                </div>
              )}

              {tab === 'all' && (
                <div className="pt-2 pb-2">
                  {STATES_SORTED.map(state => (
                    <div key={state}>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-4 py-2 bg-bg-card2 sticky top-0">
                        {state}
                      </p>
                      {CITIES_BY_STATE[state].map(city => (
                        <CityRow
                          key={city.name}
                          name={city.name} state={state}
                          selected={selectedCity === city.name}
                          onSelect={() => { onSelect(city.name); onClose() }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex-shrink-0">
          <p className="text-[10px] text-text-muted text-center">
            {CITY_NAMES.length} cities · 896+ areas across India
          </p>
        </div>
      </div>
    </div>
  )
}

function CityRow({ name, state, emoji, selected, onSelect }: {
  name: string; state: string; emoji?: string; selected: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-card2 transition-colors text-left',
        selected && 'bg-primary-muted'
      )}
    >
      <span className="text-base">{emoji || '🏙️'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-xs text-text-muted truncate">{state}</p>
      </div>
      {selected && <Check size={14} className="text-primary flex-shrink-0" />}
    </button>
  )
}
