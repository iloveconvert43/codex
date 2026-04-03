'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/ui/Avatar'
import BrandLogo from '@/components/ui/BrandLogo'
import SideMenu from './SideMenu'

export default function TopBar() {
  const { unreadCount } = useNotifications()
  const { profile, isLoggedIn } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center justify-between px-4 py-2.5">

          {/* Left — Avatar (opens side menu) like Instagram */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2.5 active:opacity-70 transition-opacity"
            aria-label="Open menu"
          >
            {isLoggedIn
              ? <Avatar user={profile} size={34} />
              : <div className="w-[34px] h-[34px] rounded-full bg-bg-card2 border border-border flex items-center justify-center text-lg">🤫</div>
            }
          </button>

          {/* Center — Logo */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <BrandLogo size="sm" />
          </Link>

          {/* Right — actions */}
          <div className="flex items-center gap-1.5">
            <Link href="/search"
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-card2 transition-colors">
              <Search size={20} strokeWidth={1.8} className="text-text-secondary" />
            </Link>

            {isLoggedIn && (
              <Link href="/notifications"
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-card2 transition-colors">
                <Bell size={20} strokeWidth={1.8} className="text-text-secondary" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-red rounded-full border-2 border-bg" />
                )}
              </Link>
            )}

            {!isLoggedIn && (
              <Link href="/login" className="btn-primary text-xs py-2 px-4">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
