'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Home, Compass, Plus, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/api'

export default function BottomNav() {
  const pathname   = usePathname()
  const router     = useRouter()

  // Prefetch all nav routes on mount — like Facebook
  useEffect(() => {
    router.prefetch('/')
    router.prefetch('/messages')
    router.prefetch('/profile')
    router.prefetch('/nearby')
  }, [router])
  const { notificationUnreadCount } = useNotifications()
  const { profile, isLoggedIn } = useAuth()
  const searchParams = useSearchParams()
  // If user is viewing a specific conversation, zero out that conversation's unread
  const activeConvUser = pathname.startsWith('/messages') ? searchParams.get('user') : null

  // Unread message count — refresh frequently + revalidate on focus
  const { data: convData } = useSWR(
    isLoggedIn ? '/api/messages/conversations' : null,
    swrFetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  )
  const unreadMsgs: number = ((convData as any)?.data || [])
    .reduce((sum: number, c: any) => {
      // If this conversation is currently open, count as 0 unread
      if (activeConvUser && c.other_user?.id === activeConvUser) return sum
      return sum + (c.unread_count || 0)
    }, 0)

  const NAV_ITEMS = [
    { href: '/',          icon: Home,          label: 'Home',      badge: 0           },
    { href: '/nearby',    icon: Compass,       label: 'Explore',   badge: 0           },
    { href: '/create',    icon: Plus,          label: '',          center: true        },
    { href: '/messages',  icon: MessageCircle, label: 'Messages',  badge: unreadMsgs  },
    { href: '/profile',   icon: User,          label: 'Profile',   badge: notificationUnreadCount },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-card/95 backdrop-blur-xl border-t border-border bottom-nav-container">
      <div className="grid grid-cols-5 h-16">
        {NAV_ITEMS.map(({ href, icon: Icon, label, center, badge }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          if (center) return (
            <Link key={href} href={href} className="flex items-center justify-center">
              <div className="w-12 h-12 -mt-4 rounded-2xl bg-gradient-to-br from-primary to-accent-red flex items-center justify-center shadow-glow active:scale-95 transition-transform">
                <Plus size={24} className="text-white" strokeWidth={2.5} />
              </div>
            </Link>
          )
          return (
            <Link key={href} href={href}
              className={cn('flex flex-col items-center justify-center gap-1 transition-colors relative',
                isActive ? 'text-primary' : 'text-text-muted')}>
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-accent-red rounded-full text-[9px] text-white flex items-center justify-center font-bold border border-bg leading-none badge-pulse shadow-sm shadow-accent-red/30">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              {label && <span className="text-[10px] font-medium">{label}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
