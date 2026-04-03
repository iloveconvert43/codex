'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  X, Home, Compass, Flame, MessageCircle, Bell,
  User, Settings, LogOut, Sun, Moon, Hash,
  Trophy, HelpCircle, Bookmark, Shield,
  ChevronRight, MapPin
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { useTheme } from '@/hooks/useTheme'
import Avatar from '@/components/ui/Avatar'

interface SideMenuProps {
  open: boolean
  onClose: () => void
}

const NAV_SECTIONS = [
  {
    items: [
      { href: '/',             icon: Home,          label: 'Home'          },
      { href: '/nearby',       icon: MapPin,         label: 'Nearby'        },
      { href: '/challenge',    icon: Flame,          label: 'Challenge'     },
      { href: '/messages',     icon: MessageCircle,  label: 'Messages',  badge: 'msg'  },
      { href: '/notifications',icon: Bell,           label: 'Notifications', badge: 'notif' },
    ]
  },
  {
    label: 'Discover',
    items: [
      { href: '/rooms',        icon: Hash,           label: 'Rooms'         },
      { href: '/leaderboard',  icon: Trophy,         label: 'Leaderboard'   },
      { href: '/questions',    icon: HelpCircle,     label: 'Questions'     },
    ]
  },
  {
    label: 'Account',
    items: [
      { href: '/profile',      icon: User,           label: 'My Profile'    },
      { href: '/bookmarks',    icon: Bookmark,       label: 'Saved'         },
      { href: '/settings',     icon: Settings,       label: 'Settings'      },
    ]
  },
]

export default function SideMenu({ open, onClose }: SideMenuProps) {
  const pathname  = usePathname()
  const router    = useRouter()
  const { profile, isLoggedIn, signOut } = useAuth()
  const { unreadCount } = useNotifications()
  const { theme, toggle, isDark } = useTheme()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSignOut() {
    onClose()
    await signOut()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={cn(
        'fixed top-0 left-0 bottom-0 z-[160] w-[300px] flex flex-col',
        'bg-bg border-r border-border',
        'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'safe-top overflow-y-auto hide-scrollbar',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-1">
            <span className="text-xl">🤫</span>
            <span className="font-black text-base tracking-tight">tryHushly</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-bg-card2 flex items-center justify-center text-text-muted hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* ── Profile card ── */}
        {isLoggedIn && profile ? (
          <Link href="/profile" onClick={onClose}
            className="flex items-center gap-3 px-5 py-4 hover:bg-bg-card2 transition-colors border-b border-border">
            <Avatar user={profile} size={48} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">
                {profile.display_name || profile.full_name || profile.username}
              </p>
              <p className="text-xs text-text-muted">@{profile.username}</p>
            </div>
            <ChevronRight size={16} className="text-text-muted" />
          </Link>
        ) : (
          <div className="px-5 py-4 border-b border-border flex gap-3">
            <Link href="/login" onClick={onClose}
              className="flex-1 text-center py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-bg-card2 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" onClick={onClose}
              className="flex-1 text-center py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">
              Sign up
            </Link>
          </div>
        )}

        {/* ── Nav sections ── */}
        <div className="flex-1 py-3">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className="mb-2">
              {section.label && (
                <p className="px-5 py-2 text-[11px] font-bold text-text-muted uppercase tracking-widest">
                  {section.label}
                </p>
              )}
              {section.items.map(({ href, icon: Icon, label, badge }) => {
                const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
                const badgeCount = badge === 'notif' ? unreadCount : 0

                return (
                  <Link key={href} href={href} onClick={onClose}
                    className={cn(
                      'flex items-center gap-3.5 mx-2 px-4 py-3 rounded-2xl transition-all',
                      isActive
                        ? 'bg-primary-muted text-primary'
                        : 'text-text-secondary hover:bg-bg-card2 hover:text-text'
                    )}>
                    <div className="relative flex-shrink-0">
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                      {badgeCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-accent-red rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-bg">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Bottom actions ── */}
        <div className="border-t border-border px-3 py-4 space-y-1">
          {/* Theme toggle */}
          <button onClick={toggle}
            className="flex items-center gap-3.5 w-full px-4 py-3 rounded-2xl text-text-secondary hover:bg-bg-card2 hover:text-text transition-all">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              {isDark
                ? <Sun size={20} strokeWidth={1.8} className="text-accent-yellow" />
                : <Moon size={20} strokeWidth={1.8} className="text-primary" />
              }
            </div>
            <span className="text-sm font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>
            {/* Toggle pill */}
            <div className={cn(
              'ml-auto w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0',
              isDark ? 'bg-bg-card2' : 'bg-primary'
            )}>
              <div className={cn(
                'w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
                isDark ? 'translate-x-0' : 'translate-x-5'
              )} />
            </div>
          </button>

          {/* Privacy */}
          <Link href="/privacy" onClick={onClose}
            className="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-text-secondary hover:bg-bg-card2 hover:text-text transition-all">
            <Shield size={20} strokeWidth={1.8} className="flex-shrink-0" />
            <span className="text-sm font-medium">Privacy Policy</span>
          </Link>

          {/* Sign out */}
          {isLoggedIn && (
            <button onClick={handleSignOut}
              className="flex items-center gap-3.5 w-full px-4 py-3 rounded-2xl text-accent-red/80 hover:bg-accent-red/10 hover:text-accent-red transition-all">
              <LogOut size={20} strokeWidth={1.8} className="flex-shrink-0" />
              <span className="text-sm font-medium">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
