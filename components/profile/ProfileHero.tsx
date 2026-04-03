'use client'

import { Shield } from 'lucide-react'

type QuickFact = {
  icon: React.ReactNode
  label: string
  accent?: boolean
}

type Stat = {
  label: string
  value: React.ReactNode
  onClick?: () => void
  accent?: boolean
}

function ProfileAvatar({ user }: { user: any }) {
  const gradients = [
    'from-violet-500 to-purple-600',
    'from-pink-500 to-rose-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
  ]
  const grad = gradients[(user?.id?.charCodeAt?.(0) || 0) % gradients.length]
  const initials = (user?.display_name || user?.username || '?')[0]?.toUpperCase()

  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt={user?.display_name || 'Profile photo'} className="w-full h-full object-cover" />
  }

  return (
    <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-black text-3xl`}>
      {initials}
    </div>
  )
}

export default function ProfileHero({
  user,
  coverUrl,
  displayName,
  username,
  bio,
  headline,
  quickFacts = [],
  interestTags = [],
  stats,
  actions,
}: {
  user: any
  coverUrl?: string | null
  displayName: string
  username?: string | null
  bio?: string | null
  headline?: string | null
  quickFacts?: QuickFact[]
  interestTags?: string[]
  stats: Stat[]
  actions: React.ReactNode
}) {
  const visibleFacts = quickFacts.filter((item) => !!item?.label).slice(0, 4)
  const visibleTags = interestTags.filter(Boolean).slice(0, 6)

  return (
    <section className="relative">
      <div className="profile-cover-shell relative h-[196px] sm:h-[240px] overflow-hidden border-b border-border/60">
        {coverUrl ? (
          <img src={coverUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="absolute inset-0 mesh-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-bg/95" />
      </div>

      <div className="relative z-10 px-4 -mt-12 sm:-mt-14">
        <div className="profile-hero-card relative rounded-[30px] border border-border/80 px-4 pt-14 pb-0 sm:px-5 sm:pt-16">
          <div className="absolute left-4 top-0 -translate-y-1/2 sm:left-5">
            <div className="profile-hero-avatar w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden">
              <ProfileAvatar user={user} />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[30px] leading-none font-black tracking-tight text-text">
                  {displayName}
                </h1>
                {user?.is_verified && (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white shadow-glow">
                    <Shield size={13} />
                  </span>
                )}
              </div>

              {username && (
                <p className="text-sm text-text-muted mt-1">@{username}</p>
              )}

              {bio && (
                <p className="text-sm text-text leading-relaxed mt-3 max-w-2xl">
                  {bio}
                </p>
              )}

              {headline && headline !== bio && (
                <p className="text-sm text-primary/90 font-medium mt-2 max-w-2xl">
                  {headline}
                </p>
              )}

              {visibleFacts.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {visibleFacts.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex items-center gap-2 text-sm ${item.accent ? 'text-primary' : 'text-text-secondary'}`}>
                      <span className="flex-shrink-0 text-text-muted">{item.icon}</span>
                      <span className="min-w-0 truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {visibleTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full sm:w-auto sm:min-w-[190px] sm:max-w-[240px]">
              {actions}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 divide-x divide-border/60 border-t border-border/60">
            {stats.map((stat) => {
              const body = (
                <>
                  <span className={`text-lg font-black tabular-nums ${stat.accent ? 'gradient-text' : 'text-text'}`}>
                    {stat.value}
                  </span>
                  <span className="text-[11px] font-medium text-text-muted mt-1">
                    {stat.label}
                  </span>
                </>
              )

              if (stat.onClick) {
                return (
                  <button
                    key={stat.label}
                    onClick={stat.onClick}
                    className="flex flex-col items-center justify-center py-3.5 px-2 hover:bg-bg-card2/60 transition-colors"
                  >
                    {body}
                  </button>
                )
              }

              return (
                <div key={stat.label} className="flex flex-col items-center justify-center py-3.5 px-2">
                  {body}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
