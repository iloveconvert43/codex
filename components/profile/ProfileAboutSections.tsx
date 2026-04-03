'use client'

import Link from 'next/link'
import { Briefcase, GraduationCap, Globe, Link2, MapPin } from 'lucide-react'

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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4 rounded-2xl space-y-3">
      <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">{title}</h3>
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

  return (
    <div className="px-4 py-4 space-y-4">
      {hasBasicInfo && (
        <Card title="Basic Info">
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
          {ext?.pinned_info && (
            <Row icon={<span className="text-base">📌</span>}>
              {ext.pinned_info}
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
        <Card title="Work">
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
        <Card title="Education">
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
        <Card title="Interests">
          <div className="flex flex-wrap gap-2">
            {interestTags.map((tag) => (
              <span key={tag} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      {hasLinks && (
        <Card title="Links">
          {ext.links.map((item: any, index: number) => (
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

      {hasSocial && (
        <Card title="Social">
          {ext?.social_instagram && (
            <Row icon={<span className="text-base">📸</span>}>
              @{ext.social_instagram}
            </Row>
          )}
          {ext?.social_twitter && (
            <Row icon={<span className="text-base">🐦</span>}>
              @{ext.social_twitter}
            </Row>
          )}
          {ext?.social_linkedin && (
            <Row icon={<Briefcase size={15} className="text-primary flex-shrink-0" />}>
              {ext.social_linkedin}
            </Row>
          )}
          {ext?.social_youtube && (
            <Row icon={<span className="text-base">▶️</span>}>
              {ext.social_youtube}
            </Row>
          )}
          {ext?.website_url && (
            <Row icon={<Globe size={15} className="text-primary flex-shrink-0" />}>
              {ext.website_url}
            </Row>
          )}
        </Card>
      )}

      {isEmpty && (
        <div className="text-center py-10 text-text-muted">
          <p className="text-3xl mb-2">📝</p>
          <p className="text-sm">No details yet</p>
          {isOwnProfile && (
            <Link href="/profile/edit" className="text-xs text-primary mt-2 inline-block">
              Add details →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
