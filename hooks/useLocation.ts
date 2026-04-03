'use client'

/**
 * hooks/useLocation.ts — Passive real-time location with geofencing
 *
 * Features:
 *  ✅ watchPosition — continuous GPS tracking (battery-friendly)
 *  ✅ Geofencing — detects when user moves to a new area (>500m)
 *  ✅ Reverse geocoding — converts lat/lng → area name (Howrah, Kolkata etc)
 *  ✅ Area-change event — notifies feed to reload with new location
 *  ✅ Server sync — updates /api/location DB every meaningful move
 *  ✅ Cache — persists across page refreshes (10min TTL)
 *  ✅ Privacy — user can clear, expires from DB after 2hrs
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface LocationState {
  lat:         number | null
  lng:         number | null
  area:        string | null   // "Howrah", "Salt Lake" etc — from reverse geocoding
  city:        string | null   // "Kolkata"
  country:     string | null
  accuracy:    number | null
  loading:     boolean
  error:       string | null
  granted:     boolean
  lastUpdated: number | null
  areaChanged: boolean         // true = user moved to new area, feed should reload
}

const CACHE_KEY        = 'hushly-loc-v3'
const CACHE_TTL        = 10 * 60 * 1000   // 10min
const MIN_MOVE_M       = 200              // ignore jitter < 200m
const AREA_CHANGE_M    = 500             // "new area" threshold = 500m
const SERVER_RATE_MS   = 60 * 1000       // send to server max 1/min
const WATCH_RESTART_MS = 30 * 60 * 1000  // restart watch every 30min

// Haversine distance in metres
function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Reverse geocode using OpenStreetMap Nominatim (free, no key needed)
async function reverseGeocode(lat: number, lng: number): Promise<{
  area: string | null; city: string | null; country: string | null
}> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    if (!res.ok) return { area: null, city: null, country: null }
    const data = await res.json()
    const addr = data.address || {}

    // Extract area (neighbourhood/suburb/town) and city
    const area = addr.neighbourhood || addr.suburb || addr.quarter ||
                 addr.village || addr.town || addr.city_district || null
    const city = addr.city || addr.town || addr.county || null
    const country = addr.country || null
    return { area, city, country }
  } catch {
    return { area: null, city: null, country: null }
  }
}

function loadCache(): (LocationState & { ts: number }) | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (Date.now() - p.ts > CACHE_TTL) return null
    return p
  } catch { return null }
}

function saveCache(state: Partial<LocationState>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, ts: Date.now() }))
  } catch {}
}

async function pushToServer(
  lat: number, lng: number, accuracy: number | null,
  city?: string | null, area?: string | null
) {
  try {
    await fetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        latitude:   lat,
        longitude:  lng,
        accuracy_m: accuracy ?? undefined,
        city:       city ?? undefined,
        locality:   area ?? undefined }) })
  } catch {}  // silently fail — never break UX
}

const INITIAL: LocationState = {
  lat: null, lng: null, area: null, city: null, country: null,
  accuracy: null, loading: false, error: null, granted: false,
  lastUpdated: null, areaChanged: false }

export function useLocation() {
  const cached = loadCache()
  const [state, setState] = useState<LocationState>(
    cached?.lat
      ? { ...INITIAL, lat: cached.lat, lng: cached.lng, area: cached.area ?? null,
          city: cached.city ?? null, country: (cached as any).country ?? null,
          accuracy: cached.accuracy ?? null, granted: true,
          lastUpdated: (cached as any).ts ?? null, areaChanged: false }
      : INITIAL
  )

  const watchId        = useRef<number | null>(null)
  // IP-based geolocation fallback (city-level accuracy) for desktop/PWA
  const ipGeoFallback = useCallback(async () => {
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return
      const data = await res.json()
      if (data.latitude && data.longitude) {
        const newState: Partial<LocationState> = {
          lat: data.latitude, lng: data.longitude,
          area: data.city || null, city: data.city || null,
          country: data.country_name || null,
          accuracy: 5000, // ~5km for IP geolocation
          granted: true, loading: false, error: null,
          lastUpdated: Date.now(), areaChanged: false,
        }
        setState(s => ({ ...s, ...newState }))
        saveCache(newState)
        lastPos.current = { lat: data.latitude, lng: data.longitude, area: data.city || null }
        pushToServer(data.latitude, data.longitude, 5000, data.city, data.city)
      }
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Could not detect location. Enable location services or check internet.' }))
    }
  }, [])

  const lastPos        = useRef<{ lat: number; lng: number; area: string | null } | null>(
    cached?.lat ? { lat: cached.lat, lng: cached.lng, area: cached.area ?? null } : null
  )
  const lastServerSend = useRef<number>(0)
  const restartTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyPosition = useCallback(async (pos: GeolocationPosition, forceGeocode = false) => {
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const acc = pos.coords.accuracy

    // Ignore GPS jitter < 200m
    if (lastPos.current && distanceM(lastPos.current.lat, lastPos.current.lng, lat, lng) < MIN_MOVE_M) {
      return
    }

    // Detect meaningful area change (>500m)
    const movedArea = !lastPos.current ||
      distanceM(lastPos.current.lat, lastPos.current.lng, lat, lng) >= AREA_CHANGE_M

    // Reverse geocode to get human-readable area name
    let geoResult = { area: state.area, city: state.city, country: state.country }
    if (movedArea || forceGeocode) {
      const result = await reverseGeocode(lat, lng)
      geoResult = {
        area:    result.area ?? state.area,
        city:    result.city ?? state.city,
        country: result.country ?? state.country }
    }

    const prevArea = lastPos.current?.area
    const areaChanged = movedArea && !!prevArea && prevArea !== geoResult.area

    lastPos.current = { lat, lng, area: geoResult.area }

    const newState: Partial<LocationState> = {
      lat, lng, accuracy: acc, granted: true, loading: false, error: null,
      lastUpdated: Date.now(), areaChanged,
      ...geoResult }
    setState(s => ({ ...s, ...newState }))
    saveCache(newState)

    // Server update rate-limited to once per minute
    const now = Date.now()
    if (now - lastServerSend.current > SERVER_RATE_MS) {
      lastServerSend.current = now
      pushToServer(lat, lng, acc, geoResult.city, geoResult.area)
    }
  }, [state.area, state.city, state.country])

  const startWatch = useCallback(() => {
    if (!navigator?.geolocation) return
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => applyPosition(pos),
      (err) => {
        console.warn('[location watch error]', err.code, err.message)
        // Fallback: if high accuracy fails (desktop without GPS, timeout),
        // retry with low accuracy (WiFi/cell tower)
        if (err.code === 2 || err.code === 3) {
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
          watchId.current = navigator.geolocation.watchPosition(
            (pos) => applyPosition(pos),
            (lowErr) => {
              console.warn('[location low-acc error]', lowErr.code)
              // Both failed — try IP-based geolocation as last resort
              ipGeoFallback()
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 }
          )
        } else if (err.code === 1) {
          // Permission denied — try IP fallback for approximate location
          ipGeoFallback()
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )

    // Auto-restart watch every 30min (browser may suspend it)
    if (restartTimer.current) clearTimeout(restartTimer.current)
    restartTimer.current = setTimeout(startWatch, WATCH_RESTART_MS)
  }, [applyPosition])

  // On mount: start passive tracking if permission already granted
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.geolocation) return

    // Check permission state without triggering dialog
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') {
          startWatch()
        }
        // Listen for permission changes
        result.addEventListener('change', () => {
          if (result.state === 'granted') {
            startWatch()
          } else if (result.state === 'denied') {
            clearLocation()
          }
        })
      }).catch(() => {
        if (cached?.lat) startWatch() // Fallback: had location before, try again
      })
    } else if (cached?.lat) {
      startWatch()
    }

    return () => {
      if (watchId.current !== null && navigator?.geolocation) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      if (restartTimer.current) clearTimeout(restartTimer.current)
    }
  }, []) // eslint-disable-line

  // Explicit user-initiated request (shows browser permission dialog)
  const requestLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation is not supported by your browser' }))
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))

    // Try high accuracy first (GPS), fallback to low accuracy (WiFi/Cell)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyPosition(pos, true)
        startWatch()
      },
      (highAccErr) => {
        // If high accuracy fails, try low accuracy as fallback
        if (highAccErr.code === 2 || highAccErr.code === 3) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              await applyPosition(pos, true)
              startWatch()
            },
            (lowAccErr) => {
              const msg: Record<number, string> = {
                1: 'Location access denied. Allow it in your browser/device settings.',
                2: 'Could not detect location. Check that location services are enabled on your device.',
                3: 'Location request timed out. Check your internet connection and try again.' }
              setState(s => ({ ...s, loading: false, error: msg[lowAccErr.code] ?? 'Location error' }))
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 }
          )
        } else {
          const msg: Record<number, string> = {
            1: 'Location access denied. Allow it in your browser/device settings.',
            2: 'Could not detect location. Check that location services are enabled on your device.',
            3: 'Location request timed out. Try again.' }
          setState(s => ({ ...s, loading: false, error: msg[highAccErr.code] ?? 'Location error' }))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [applyPosition, startWatch])

  const clearLocation = useCallback(() => {
    if (watchId.current !== null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    if (restartTimer.current) clearTimeout(restartTimer.current)
    localStorage.removeItem(CACHE_KEY)
    lastPos.current = null
    setState({ ...INITIAL })
    fetch('/api/location', { method: 'DELETE' }).catch(() => {})
  }, [])

  // Once area-change is "consumed" by the feed, reset the flag
  const acknowledgeAreaChange = useCallback(() => {
    setState(s => ({ ...s, areaChanged: false }))
  }, [])

  return {
    ...state,
    requestLocation,
    clearLocation,
    acknowledgeAreaChange,
    accuracy: state.accuracy }
}
