'use client'

const fetcher = (url: string) => fetch(url).then(r => r.json())

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { Search, X, Clock, TrendingUp, Users, Hash, FileText, ArrowLeft, UserPlus } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import FeedCard from '@/components/feed/FeedCard'
import BottomNav from '@/components/layout/BottomNav'
import type { Post } from '@/types'
import toast from 'react-hot-toast'

type SearchTab = 'all' | 'posts' | 'people' | 'tags'

// ── Local storage helpers ────────────────────────────────────
function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem('search-history-v2') || '[]') } catch { return [] }
}
function pushHistory(q: string) {
  try {
    const h = getHistory().filter(x => x.toLowerCase() !== q.toLowerCase())
    localStorage.setItem('search-history-v2', JSON.stringify([q, ...h].slice(0, 8)))
  } catch {}
}
function clearHistory() {
  try { localStorage.removeItem('search-history-v2') } catch {}
}

// ── Inline follow button ─────────────────────────────────────
function InlineFollow({ userId, initialFollowing }: { userId: string; initialFollowing?: boolean }) {
  const { isLoggedIn, profile } = useAuth()
  const [following, setFollowing] = useState(initialFollowing ?? false)
  const [loading, setLoading] = useState(false)
  if (!isLoggedIn || profile?.id === userId) return null

  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setLoading(true)
    try {
      const res = await api.post(`/api/users/${userId}/follow`, {}, { requireAuth: true }) as any
      if (res.action === 'followed' || res.is_following) setFollowing(true)
      else setFollowing(false)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={cn(
        'flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-all flex-shrink-0',
        following
          ? 'bg-bg-card2 border border-border text-text-muted'
          : 'bg-primary text-white'
      )}>
      {loading
        ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : following ? 'Following' : <><UserPlus size={11} /> Follow</>
      }
    </button>
  )
}

export default function SearchContent() {
  const params = useSearchParams()
  const { profile, isLoggedIn } = useAuth()
  const [query, setQuery]     = useState(params.get('q') || '')
  const [tab, setTab]         = useState<SearchTab>('all')
  const [history, setHistory] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(!params.get('q'))
  const inputRef = useRef<HTMLInputElement>(null)
  const dq = useDebounce(query, 350)

  useEffect(() => { setHistory(getHistory()) }, [])

  // Sync URL without navigation
  useEffect(() => {
    const url = new URL(window.location.href)
    if (dq) url.searchParams.set('q', dq)
    else url.searchParams.delete('q')
    window.history.replaceState({}, '', url.toString())
  }, [dq])

  // Main search results
  const { data, isLoading } = useSWR(
    dq.length >= 1 ? `/api/search?q=${encodeURIComponent(dq)}&type=${tab}&limit=30` : null,
    fetcher, { revalidateOnFocus: false }
  )

  // Autocomplete suggestions while typing (people only, fast)
  const { data: suggestData } = useSWR(
    query.length >= 1 && showSuggestions
      ? `/api/search?q=${encodeURIComponent(query)}&type=people&limit=5`
      : null,
    fetcher, { revalidateOnFocus: false }
  )

  const results  = (data as any)?.data ?? { posts: [], people: [], rooms: [] }
  const suggests = (suggestData as any)?.data?.people ?? []

  // Trending tags
  const { data: trendingData } = useSWR('/api/feed/trending-tags?limit=10', swrFetcher)
  const trendingTags: string[] = (trendingData as any)?.data?.map((t: any) => t.tag || t) ?? []

  function submit(q: string) {
    if (!q.trim()) return
    pushHistory(q.trim())
    setHistory(getHistory())
    setQuery(q.trim())
    setShowSuggestions(false)
    inputRef.current?.blur()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit(query)
  }

  const hasResults = results.posts?.length || results.people?.length || results.rooms?.length
  const showDropdown = showSuggestions && query.length >= 1 && (suggests.length > 0 || history.length > 0)

  return (
    <div className="min-h-screen bg-bg pb-20 feed-container">

      {/* ── Header ── */}
      <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <Link href="/" className="text-text-muted hover:text-text flex-shrink-0">
            <ArrowLeft size={22} />
          </Link>
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
              onKeyDown={handleKey}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search people, posts, tags…"
              className="w-full bg-bg-card2 border border-border rounded-full pl-9 pr-9 py-2.5 text-sm outline-none focus:border-primary transition-colors"
              autoFocus
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setShowSuggestions(true); inputRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs — only when results showing */}
        {!showSuggestions && dq.length >= 1 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto hide-scrollbar">
            {([
              { id: 'all',    label: 'All'    },
              { id: 'people', label: 'People' },
              { id: 'posts',  label: 'Posts'  },
              { id: 'tags',   label: 'Tags'   },
            ] as { id: SearchTab; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-xs font-bold flex-shrink-0 border transition-all',
                  tab === t.id
                    ? 'bg-primary border-primary text-white'
                    : 'border-border text-text-muted hover:border-primary hover:text-primary'
                )}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Autocomplete dropdown (Facebook-style) ── */}
      {showDropdown && (
        <div className="bg-bg border-b border-border">
          {/* History items */}
          {history.filter(h => h.toLowerCase().includes(query.toLowerCase())).slice(0, 3).map(h => (
            <button key={h} onClick={() => submit(h)}
              className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-bg-card2 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-bg-card2 flex items-center justify-center flex-shrink-0">
                <Clock size={16} className="text-text-muted" />
              </div>
              <span className="text-sm text-text">{h}</span>
            </button>
          ))}

          {/* People suggestions */}
          {suggests.map((user: any) => (
            <button key={user.id} onClick={() => submit(user.display_name || user.username)}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-bg-card2 transition-colors text-left">
              <Avatar user={user} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text truncate">
                  {user.display_name || user.username}
                </p>
                <p className="text-xs text-text-muted">@{user.username} · People</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state — Recent + Trending ── */}
      {!query && (
        <div className="p-4 space-y-6">
          {/* Recent searches */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-sm">Recent</p>
                <button onClick={() => { clearHistory(); setHistory([]) }}
                  className="text-xs text-primary">Clear all</button>
              </div>
              <div className="space-y-1">
                {history.map(h => (
                  <button key={h} onClick={() => submit(h)}
                    className="flex items-center gap-3 w-full p-3 rounded-2xl hover:bg-bg-card2 transition-colors text-left group">
                    <div className="w-10 h-10 rounded-full bg-bg-card2 flex items-center justify-center flex-shrink-0">
                      <Clock size={16} className="text-text-muted" />
                    </div>
                    <span className="flex-1 text-sm">{h}</span>
                    <button onClick={e => {
                      e.stopPropagation()
                      const next = history.filter(x => x !== h)
                      localStorage.setItem('search-history-v2', JSON.stringify(next))
                      setHistory(next)
                    }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text transition-all">
                      <X size={14} />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending tags */}
          {trendingTags.length > 0 && (
            <div>
              <p className="font-bold text-sm mb-3 flex items-center gap-2">
                <TrendingUp size={15} className="text-primary" /> Trending
              </p>
              <div className="space-y-1">
                {trendingTags.map((tag: string) => (
                  <button key={tag} onClick={() => submit('#' + tag)}
                    className="flex items-center gap-3 w-full p-3 rounded-2xl hover:bg-bg-card2 transition-colors text-left">
                    <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center flex-shrink-0">
                      <Hash size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">#{tag}</p>
                      <p className="text-xs text-text-muted">Hashtag</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && dq && !showSuggestions && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── No results ── */}
      {!isLoading && dq.length >= 1 && !showSuggestions && !hasResults && (
        <div className="py-16 text-center px-8">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-bold mb-1">No results for "{dq}"</p>
          <p className="text-sm text-text-muted">Try different keywords</p>
        </div>
      )}

      {/* ── RESULTS ── */}
      {!isLoading && !showSuggestions && dq.length >= 1 && hasResults && (
        <div>

          {/* ── PEOPLE ── */}
          {(tab === 'all' || tab === 'people') && results.people?.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <Users size={14} className="text-primary" /> People
                </h2>
                {tab === 'all' && results.people.length > 3 && (
                  <button onClick={() => setTab('people')} className="text-xs text-primary font-semibold">See all</button>
                )}
              </div>
              {(tab === 'all' ? results.people.slice(0, 3) : results.people).map((user: any) => (
                <Link key={user.id} href={`/profile/${user.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-card2 transition-colors border-b border-border last:border-0">
                  <Avatar user={user} size={52} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm">
                        {user.display_name || user.username}
                      </span>
                      {user.is_verified && <span className="text-primary text-xs font-bold">✓</span>}
                      {user.is_private && <span className="text-xs">🔒</span>}
                    </div>
                    <p className="text-xs text-text-muted">@{user.username}</p>
                    {/* Mutual info */}
                    {user.mutual_count > 0 && (
                      <p className="text-xs text-text-muted mt-0.5">
                        {user.mutual_count} mutual follower{user.mutual_count > 1 ? 's' : ''}
                      </p>
                    )}
                    {user.bio && !user.mutual_count && (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{user.bio}</p>
                    )}
                    {/* Follower count */}
                    {user.follower_count > 0 && (
                      <p className="text-xs text-text-muted mt-0.5">
                        {user.follower_count.toLocaleString('en-IN')} follower{user.follower_count !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <InlineFollow userId={user.id} initialFollowing={user.is_following} />
                </Link>
              ))}
            </section>
          )}

          {/* ── TAGS ── */}
          {(tab === 'all' || tab === 'tags') && results.rooms?.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <Hash size={14} className="text-primary" /> Tags & Rooms
                </h2>
                {tab === 'all' && results.rooms.length > 3 && (
                  <button onClick={() => setTab('tags')} className="text-xs text-primary font-semibold">See all</button>
                )}
              </div>
              {(tab === 'all' ? results.rooms.slice(0, 3) : results.rooms).map((room: any) => (
                <Link key={room.id} href={`/rooms/${room.slug}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-card2 transition-colors border-b border-border last:border-0">
                  <div className="w-12 h-12 rounded-2xl bg-primary-muted flex items-center justify-center text-2xl flex-shrink-0">
                    {room.emoji || '#'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{room.name}</p>
                    {room.description && <p className="text-xs text-text-muted line-clamp-1">{room.description}</p>}
                    <p className="text-xs text-text-muted mt-0.5">{(room.member_count || 0).toLocaleString('en-IN')} members</p>
                  </div>
                  <span className={cn(
                    'text-xs font-bold px-3 py-1.5 rounded-full border flex-shrink-0',
                    room.is_member ? 'border-border text-text-muted' : 'border-primary text-primary'
                  )}>
                    {room.is_member ? 'Joined' : '+ Join'}
                  </span>
                </Link>
              ))}
            </section>
          )}

          {/* ── Also show matching hashtag posts ── */}
          {(tab === 'all' || tab === 'tags') && dq && !dq.startsWith('#') && (
            <div className="px-4 py-2 border-b border-border">
              <button onClick={() => submit('#' + dq)}
                className="flex items-center gap-3 w-full py-2 hover:opacity-80 transition-opacity text-left">
                <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center flex-shrink-0">
                  <Hash size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Search for #{dq}</p>
                  <p className="text-xs text-text-muted">Hashtag</p>
                </div>
              </button>
            </div>
          )}

          {/* ── POSTS ── */}
          {(tab === 'all' || tab === 'posts') && results.posts?.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <FileText size={14} className="text-primary" /> Posts
                </h2>
                {tab === 'all' && results.posts.length > 3 && (
                  <button onClick={() => setTab('posts')} className="text-xs text-primary font-semibold">See all</button>
                )}
              </div>
              {(tab === 'all' ? results.posts.slice(0, 3) : results.posts).map((post: Post) => (
                <FeedCard key={post.id} post={post} />
              ))}
            </section>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
