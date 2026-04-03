'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Home, MapPin, Plus, Flame, User, MessageCircle, Bell, Search, Hash, Trophy, HelpCircle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import Avatar from '@/components/ui/Avatar'
import BrandLogo from '@/components/ui/BrandLogo'
import PointsWidget from '@/components/ui/PointsWidget'

const NAV = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/nearby', icon: MapPin, label: 'Nearby' },
  { href: '/messages', icon: MessageCircle, label: 'Messages' },
  { href: '/notifications', icon: Bell, label: 'Notifications', badge: true },
  { href: '/search', icon: Search, label: 'Search' },
  { href: '/challenge', icon: Flame, label: 'Challenge' },
  { href: '/rooms', icon: Hash, label: 'Rooms' },
  { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { href: '/questions', icon: HelpCircle, label: 'Questions' },
]

export default function DesktopSidebar() {
  const pathname = usePathname()
  const { profile, isLoggedIn, signOut } = useAuth()
  const { unreadCount } = useNotifications()

  return (
    <aside className="w-64 xl:w-72 flex-shrink-0 h-screen flex flex-col border-r border-border overflow-y-auto hide-scrollbar">
      <div className="p-5">
        {/* Logo */}
        <Link href="/" className="mb-7 block">
          <BrandLogo size="md" />
        </Link>

        {/* Nav */}
        <nav className="space-y-0.5">
          {NAV.map(({ href, icon: Icon, label, badge }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative',
                  isActive
                    ? 'bg-primary-muted text-primary'
                    : 'text-text-secondary hover:bg-bg-card2 hover:text-text'
                )}>
                <div className="relative">
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  {badge && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent-red rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-bg">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Create button */}
        <Link href="/create"
          className="flex items-center justify-center gap-2 w-full mt-5 py-3 bg-gradient-to-r from-primary to-accent-red text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity shadow-glow">
          <Plus size={18} /> Create Post
        </Link>

        {/* Points widget */}
        {isLoggedIn && (
          <div className="mt-4">
            <PointsWidget />
          </div>
        )}
      </div>

      {/* Profile at bottom */}
      <div className="mt-auto p-4 border-t border-border">
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <Link href="/profile">
              <Avatar user={profile} size={36} />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.display_name || profile?.full_name || profile?.username}</p>
              {profile?.username && <p className="text-xs text-text-muted truncate">@{profile.username}</p>}
            </div>
            <Link href="/settings" className="text-text-muted hover:text-text transition-colors">
              <Settings size={16} />
            </Link>
          </div>
        ) : (
          <Link href="/login" className="btn-primary w-full text-center text-sm py-2.5 block">Sign In</Link>
        )}
      </div>
    {/* Legal footer links */}
      <div className="px-4 pb-4 pt-2 border-t border-border">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {[['About', '/about'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
            <Link key={href} href={href}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors">
              {label}
            </Link>
          ))}
        </div>
      </div>
  </aside>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark'|'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('hushly-theme') as 'dark'|'light' || 'dark'
    setTheme(saved)
    document.documentElement.classList.toggle('light-mode', saved === 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('hushly-theme', next)
    document.documentElement.classList.toggle('light-mode', next === 'light')
  }

  return (
    <button onClick={toggle}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-bg-card2 transition-colors text-text-secondary hover:text-text">
      <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span className="text-sm font-semibold">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )
}
