'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import Link from 'next/link'
import { TrendingUp, Users, Zap, HelpCircle, UserPlus } from 'lucide-react'
import ChallengeCard from '@/components/challenge/ChallengeCard'
import useSWR from 'swr'
import {} from '@/lib/api'
import Avatar from '@/components/ui/Avatar'
import { useAuth } from '@/hooks/useAuth'

// Follow suggestions — "People you may know"
function useFollowSuggestions() {
  const { isLoggedIn } = useAuth()
  const { data } = useSWR(isLoggedIn ? '/api/users/suggestions?limit=3' : null, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300000 })
  return (data as any)?.data || []
}

// Real trending tags from DB
function useTrendingTags() {
  const { data } = useSWR('/api/trending/tags', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300000, // 5 min
  })
  return (data as any)?.data || []
}

// Real top contributors from DB
function useTopContributors() {
  const { data } = useSWR('/api/trending/contributors', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300000 })
  return (data as any)?.data || []
}

// Today's featured question
function useFeaturedQuestion() {
  const { data } = useSWR('/api/questions?limit=1', fetcher, {
    revalidateOnFocus: false })
  const questions = (data as any)?.data || []
  return questions[0] || null
}

export default function RightSidebar() {
  const trendingTags = useTrendingTags()
  const contributors = useTopContributors()
  const question = useFeaturedQuestion()
  const suggestions = useFollowSuggestions()

  return (
    <aside className="hidden xl:flex flex-col w-80 h-screen border-l border-border px-4 py-6 flex-shrink-0 sticky top-0 overflow-y-auto hide-scrollbar">

      {/* Challenge */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
          <Zap size={12} /> Today's Challenge
        </h3>
        <ChallengeCard compact />
      </div>

      {/* People you may know */}
      {suggestions.length > 0 && (
        <div className="glass-card p-4 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
            <UserPlus size={12} /> People you may know
          </h3>
          {suggestions.map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 py-2">
              <Link href={`/profile/${u.id}`} className="flex-shrink-0">
                <Avatar user={u} size={32} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${u.id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                  {u.display_name || u.username}
                </Link>
                <p className="text-[10px] text-text-muted truncate">
                  {u.suggestion_reason === 'mutual_follow' ? '👥 Mutual friends'
                    : u.suggestion_reason === 'same_city' ? `📍 ${u.city || 'Same city'}`
                    : '✨ Suggested for you'}
                </p>
              </div>
              <Link
                href={`/profile/${u.id}`}
                className="text-[10px] text-primary font-semibold border border-primary/30 px-2 py-1 rounded-full hover:bg-primary/10 transition-colors flex-shrink-0"
              >
                Follow
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Trending tags */}
      <div className="glass-card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
          <TrendingUp size={12} /> Trending
        </h3>
        {trendingTags.length > 0 ? (
          trendingTags.slice(0, 5).map((tag: any, i: number) => (
            <Link
              key={tag.tag}
              href={`/search?q=${encodeURIComponent('#' + tag.tag)}&type=tags`}
              className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:text-primary transition-colors group"
            >
              <span className="text-xs text-text-muted w-4 flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  #{tag.tag}
                  {tag.is_interested && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1 py-0.5 rounded-full font-semibold">YOU</span>
                  )}
                </div>
                <div className="text-xs text-text-muted">{tag.count} posts</div>
              </div>
            </Link>
          ))
        ) : (
          // Skeleton while loading
          [1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="w-4 h-3 bg-bg-card2 rounded" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-bg-card2 rounded w-24" />
                <div className="h-2 bg-bg-card2 rounded w-14" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Top contributors */}
      <div className="glass-card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
          <Users size={12} /> Top Contributors
        </h3>
        {contributors.length > 0 ? (
          contributors.slice(0, 3).map((u: any, i: number) => (
            <Link
              key={u.id}
              href={`/profile/${u.id}`}
              className="flex items-center gap-3 py-2 hover:bg-white/[0.03] -mx-1 px-1 rounded-lg transition-colors"
            >
              <span className="text-base flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
              <Avatar user={u} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.display_name || u.username}</div>
              </div>
              <div className="text-xs text-text-muted flex-shrink-0">{u.post_count} posts</div>
            </Link>
          ))
        ) : (
          [1,2,3].map(i => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="w-5 h-5 bg-bg-card2 rounded-full" />
              <div className="w-6 h-6 bg-bg-card2 rounded-full" />
              <div className="flex-1 h-3 bg-bg-card2 rounded" />
            </div>
          ))
        )}
      </div>

      {/* Featured question */}
      {question && (
        <div className="glass-card p-4 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 flex items-center gap-2">
            <HelpCircle size={12} /> Question of the Day
          </h3>
          <p className="text-sm font-medium leading-snug mb-2">"{question.question_text}"</p>
          <Link href="/questions" className="text-xs text-primary hover:underline">
            Answer now →
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto text-xs text-text-muted">
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          {['About', 'Privacy', 'Terms', 'Help'].map((l) => (
            <Link key={l} href="#" className="hover:text-text transition-colors">{l}</Link>
          ))}
        </div>
        <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">💬 Rooms</h3>
          <Link href="/rooms" className="text-xs text-primary hover:underline">Explore</Link>
        </div>
      </div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">🏆 Leaderboard</h3>
          <Link href="/leaderboard" className="text-xs text-primary hover:underline">View all</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          {[['About', '/about'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
            <a key={href} href={href}
              className="text-[11px] text-text-muted hover:text-text-secondary transition-colors">
              {label}
            </a>
          ))}
        </div>
        <p>© 2025 <span style={{opacity:.6,fontSize:'0.8em',fontWeight:500}}>try</span><span className="gradient-text">Hushly</span></p>
      </div>
    </aside>
  )
}
