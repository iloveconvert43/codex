'use client'

import { swrFetcher as fetcher } from '@/lib/api'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { MapPin, Users, TrendingUp, Plus, Navigation } from 'lucide-react'
import useSWR from 'swr'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import FeedList from '@/components/feed/FeedList'
import Link from 'next/link'
import { useLocation } from '@/hooks/useLocation'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

// Active users nearby (from user_locations table)
function useNearbyUsers(lat: number | null, lng: number | null) {
  const { data } = useSWR(
    lat && lng ? `/api/location/nearby?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius=5` : null,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )
  return (data as any)?.data || []
}

// Trending tags near user
function useNearbyTags(lat: number | null, lng: number | null) {
  const { data } = useSWR(
    lat && lng ? `/api/trending/tags?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&nearby=1` : null,
    fetcher,
    { refreshInterval: 300000, revalidateOnFocus: false }
  )
  return (data as any)?.data || []
}

export default function NearbyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <MapPin size={18} className="text-primary" />
            <h1 className="font-bold">Nearby</h1>
            <Link href="/create?scope=nearby"
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">
              <Plus size={13} /> Post nearby
            </Link>
          </div>
        </div>
        <main className="pb-nav">
          <NearbyContent />
        </main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-primary" />
              <h1 className="font-bold">Nearby</h1>
            </div>
            <Link href="/create?scope=nearby"
              className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors">
              <Plus size={13} /> Post nearby
            </Link>
          </div>
          <div className="max-w-2xl mx-auto">
            <NearbyContent />
          </div>
        </main>
      </div>
    </div>
  )
}

function NearbyContent() {
  // Read from localStorage cache only — FeedList owns the GPS watch
  // This avoids dual GPS watchers and double battery drain
  const [cachedLoc, setCachedLoc] = React.useState<{lat:number|null,lng:number|null,area:string|null,city:string|null,granted:boolean}>({
    lat: null, lng: null, area: null, city: null, granted: false
  })

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('hushly-loc-v3')
      if (!raw) return
      const d = JSON.parse(raw)
      if (d?.lat && d?.lng) {
        setCachedLoc({ lat: d.lat, lng: d.lng, area: d.area || null, city: d.city || null, granted: true })
      }
    } catch {}
  }, [])

  const { lat, lng, area, city, granted } = cachedLoc
  const nearbyUsers = useNearbyUsers(lat, lng)
  const nearbyTags  = useNearbyTags(lat, lng)
  const nearbyArea  = area || city

  return (
    <div>
      {/* Active users nearby — only when location granted */}
      {granted && lat && nearbyUsers.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Active nearby · {nearbyUsers.length} {nearbyUsers.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            {nearbyUsers.slice(0, 8).map((u: any) => (
              <Link key={u.id} href={`/profile/${u.id}`}
                className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="relative">
                  <Avatar user={u} size={40} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent-green border-2 border-bg" />
                </div>
                <span className="text-[10px] text-text-muted max-w-[48px] truncate text-center">
                  {u.display_name || u.username}
                </span>
                {u.distance_m && (
                  <span className="text-[9px] text-primary font-medium">
                    {u.distance_m < 1000
                      ? `${Math.round(u.distance_m)}m`
                      : `${(u.distance_m/1000).toFixed(1)}km`}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trending local tags */}
      {granted && nearbyTags.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={12} className="text-text-muted" />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Trending {nearbyArea ? `in ${nearbyArea}` : 'nearby'}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {nearbyTags.slice(0, 8).map((tag: any) => (
              <Link key={tag.tag}
                href={`/search?q=${encodeURIComponent('#' + tag.tag)}`}
                className="text-xs text-primary bg-primary-muted border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors">
                #{tag.tag}
                {tag.count > 1 && (
                  <span className="text-[10px] text-primary/60 ml-1">{tag.count}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main feed — FeedList owns the GPS watch */}
      <FeedList filter="nearby" />
    </div>
  )
}
