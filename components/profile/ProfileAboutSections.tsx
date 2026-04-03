'use client'

import Link from 'next/link'
import { Briefcase, GraduationCap, Globe, Link2, MapPin, Sparkles } from 'lucide-react'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

function flattenInterests(interests: any): string[] {
  if (!interests) return []
  const keys = ['music', 'tv_shows', 'movies', 'games', 'sports', 'places', 'hobbies', 'books']
  const values = keys.flatMap((key) => Array.isArray(interests[key]) ? interests[key] : [])
  return Array.from(new Set(values.filter(Boolean))).slice(0, 24)
}

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="glass-card p-4 rounded-[24px] space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-bold text-text">{title}</h3>
          <p className="text-[11px] text-text-muted">Visible on the profile when allowed by privacy.</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

export default function ProfileAboutSections({
  user,
  ext,
  points,
  isOwnProfile = false,
}: {
  user: any
  ext: any
  points?: any
  isOwnProfile?: boolean
}) {
  const currentCity = ext?.current_city || user?.current_city || user?.city
  const interestTags = flattenInterests(ext?.interests)
  const hasBasicInfo = !!(
    currentCity ||
    ext?.hometown ||
    ext?.pinned_info ||
    ext?.relationship_status ||
    ext?.pronouns ||
    ext?.nationality ||
    ext?.dob ||
    (ext?.languages?.length || 0) > 0 ||
    ext?.pinned_info ||
    points
  )
  const hasLinks = (ext?.links?.length || 0) > 0
  const hasSocial = !!(ext?.social_instagram || ext?.social_twitter || ext?.social_linkedin || ext?.social_youtube)
  const isEmpty = !hasBasicInfo && !(ext?.work?.length > 0) && !(ext?.education?.length > 0) && interestTags.length === 0 && !hasLinks && !hasSocial
  const contactRows = [
    ext?.website_url ? {
      icon: <Globe size={15} className="text-primary flex-shrink-0" />,
      label: ext.website_url,
      href: ext.website_url,
    } : null,
    ext?.social_instagram ? { icon: <span className="text-base">📸</span>, label: `@${ext.social_instagram}` } : null,
    ext?.social_twitter ? { icon: <span className="text-base">🐦</span>, label: `@${ext.social_twitter}` } : null,
    ext?.social_linkedin ? { icon: <Briefcase size={15} className="text-primary flex-shrink-0" />, label: ext.social_linkedin } : null,
    ext?.social_youtube ? { icon: <span className="text-base">▶️</span>, label: ext.social_youtube } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; label: string; href?: string }>

  return (
    <div className="px-4 py-4 space-y-4">
      {hasBasicInfo && (
        <Card title="Personal Details" icon={<MapPin size={17} />}>
          {ext?.pinned_info && (
            <div className="rounded-2xl bg-primary/8 border border-primary/10 px-3 py-2.5 text-sm text-text-secondary">
              {ext.pinned_info}
            </div>
          )}
          {currentCity && (
            <Row icon={<MapPin size={16} className="text-primary flex-shrink-0" />}>
              Lives in {currentCity}
            </Row>
          )}
          {ext?.hometown && (
            <Row icon={<span className="text-base">🏡</span>}>
              From {ext.hometown}
            </Row>
          )}
          {ext?.relationship_status && (
            <Row icon={<span className="text-base">❤️</span>}>
              <span className="capitalize">{String(ext.relationship_status).replace(/_/g, ' ')}</span>
            </Row>
          )}
          {ext?.pronouns && (
            <Row icon={<span className="text-base">👤</span>}>
              {ext.pronouns}
            </Row>
          )}
          {ext?.nationality && (
            <Row icon={<span className="text-base">🌍</span>}>
              {ext.nationality}
            </Row>
          )}
          {ext?.dob && (
            <Row icon={<span className="text-base">🎂</span>}>
              Born on {formatDate(ext.dob)}
            </Row>
          )}
          {Array.isArray(ext?.languages) && ext.languages.length > 0 && (
            <Row icon={<span className="text-base">🗣️</span>}>
              {ext.languages.join(', ')}
            </Row>
          )}
          {points && (
            <Row icon={<span className="text-base">⭐</span>}>
              Level: <span className="text-primary font-semibold capitalize ml-1">{String(points.level || 'curious_newcomer').replace(/_/g, ' ')}</span>
            </Row>
          )}
        </Card>
      )}

      {ext?.work?.length > 0 && (
        <Card title="Work" icon={<Briefcase size={17} />}>
          {ext.work.map((item: any, index: number) => (
            <div key={`${item.company || 'work'}-${index}`} className="flex items-start gap-3">
              <Briefcase size={15} className="text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">{item.position || item.role || 'Work'}</p>
                <p className="text-xs text-text-muted">
                  {[item.company, item.city].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {ext?.education?.length > 0 && (
        <Card title="Education" icon={<GraduationCap size={17} />}>
          {ext.education.map((item: any, index: number) => (
            <div key={`${item.school || 'education'}-${index}`} className="flex items-start gap-3">
              <GraduationCap size={15} className="text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">{item.school}</p>
                <p className="text-xs text-text-muted">
                  {[item.degree, item.field].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {interestTags.length > 0 && (
        <Card title="Interests" icon={<Sparkles size={17} />}>
          <div className="flex flex-wrap gap-2">
            {interestTags.map((tag) => (
              <span key={tag} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      {(hasLinks || hasSocial || ext?.website_url) && (
        <Card title="Contact Info" icon={<Link2 size={17} />}>
          {contactRows.map((item, index) => (
            item.href ? (
              <a
                key={`${item.label}-${index}`}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 text-sm text-primary hover:underline"
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            ) : (
              <Row key={`${item.label}-${index}`} icon={item.icon}>
                {item.label}
              </Row>
            )
          ))}
          {(ext?.links || []).map((item: any, index: number) => (
            <a
              key={`${item.url || 'link'}-${index}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 text-sm text-primary hover:underline"
            >
              <Link2 size={14} className="flex-shrink-0" />
              <span>{item.label || item.url}</span>
            </a>
          ))}
        </Card>
      )}

      {isEmpty && (
        <div className="glass-card rounded-[24px] text-center py-10 px-4 text-text-muted">
          <p className="text-3xl mb-2">📝</p>
          <p className="text-sm font-semibold text-text">No profile details yet</p>
          <p className="text-xs mt-1">Add city, work, links and interests to make this profile feel complete.</p>
          {isOwnProfile && (
            <Link href="/profile/edit" className="text-xs text-primary mt-3 inline-block font-semibold">
              Add details →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
