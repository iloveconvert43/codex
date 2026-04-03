/**
 * store/userStore.ts — Global user state with Zustand
 *
 * DEEP FIX: Auth flow race conditions eliminated
 *
 * Problem was:
 *   1. initialize() fetches session → sets initialized=true → awaits ensureProfile()
 *   2. onAuthStateChange fires AGAIN with same session (Supabase behavior)
 *   3. Both run ensureProfile() in parallel → double DB calls, race condition
 *   4. loading stays true longer than needed
 *   5. router.push('/') fires before Zustand store has profile → shows spinner → looks stuck
 *
 * Fix:
 *   - ensureProfile is idempotent (locks with a flag)
 *   - loading=false fires as soon as profile is set
 *   - initialized=true only after everything is ready
 *   - Store exposes a waitForAuth() promise for login/signup to await
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'
import type { User as SupaUser } from '@supabase/supabase-js'

interface UserStore {
  supaUser:    SupaUser | null
  profile:     User | null
  loading:     boolean
  initialized: boolean

  setSupaUser:    (user: SupaUser | null) => void
  setProfile:     (profile: User | null) => void
  setLoading:     (v: boolean) => void
  refreshProfile: () => Promise<void>
  signOut:        () => Promise<void>
  initialize:     () => Promise<() => void>
  waitForAuth:    () => Promise<void>  // resolves when auth is fully ready
}

const DEFAULT_PRIVACY = {
  show_gender:      'public',
  show_dob:         'private',
  show_phone:       'private',
  show_nationality: 'public',
  show_address:     'private',
}

// Global lock — prevents concurrent ensureProfile calls
let profileFetchLock = false
let profileFetchedForUserId: string | null = null

export const useUserStore = create<UserStore>()(
  subscribeWithSelector((set, get) => ({
    supaUser:    null,
    profile:     null,
    loading:     true,
    initialized: false,

    setSupaUser: (user)    => set({ supaUser: user }),
    setProfile:  (profile) => set({ profile }),
    setLoading:  (loading) => set({ loading }),

    refreshProfile: async () => {
      const { supaUser } = get()
      if (!supaUser) return
      const { data } = await supabase
        .from('users').select('*').eq('auth_id', supaUser.id).single()
      if (data) {
        try { localStorage.setItem('tryhushly-profile-v1', JSON.stringify(data)) } catch {}
        set({ profile: data })
      }
    },

    signOut: async () => {
      profileFetchedForUserId = null
      profileFetchLock = false
      await supabase.auth.signOut()
      set({ supaUser: null, profile: null, loading: false })
      window.location.href = '/login'
    },

    // Wait until auth is fully initialized (profile loaded or confirmed no session)
    // Called AFTER setSession() — must wait for onAuthStateChange to fire and profile to load
    waitForAuth: () => {
      return new Promise<void>(resolve => {
        // Check if profile is ALREADY loaded (e.g. from cached localStorage)
        const { profile } = get()
        if (profile) { resolve(); return }

        // Wait for profile to be set (from ensureProfile after onAuthStateChange)
        const unsub = useUserStore.subscribe(
          state => ({ profile: state.profile, loading: state.loading, initialized: state.initialized }),
          ({ profile, loading, initialized }) => {
            // Resolve when: profile loaded, OR auth fully resolved with no user
            if (profile || (initialized && !loading && !get().supaUser)) {
              unsub()
              resolve()
            }
          }
        )

        // Hard 5s timeout — never block login redirect forever
        setTimeout(() => { unsub(); resolve() }, 5000)
      })
    },

    initialize: async () => {
      // Fast path: check if we have a cached session in localStorage
      // This lets us show the loading state immediately without waiting for getSession()
      try {
        const storageKey = 'tryhushly-auth-v1'
        const cached = localStorage.getItem(storageKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed?.currentSession?.user) {
            // We have a cached session — set loading state immediately
            // The full getSession() call below will verify and refresh it
            set({ supaUser: parsed.currentSession.user, loading: true })
          }
        }
      } catch {}

      const ensureProfile = async (user: SupaUser) => {
        // Prevent duplicate calls for same user
        if (profileFetchLock && profileFetchedForUserId === user.id) return
        if (profileFetchedForUserId === user.id && get().profile) {
          set({ loading: false })
          return
        }

        profileFetchLock = true
        profileFetchedForUserId = user.id

        // Fast path: load from localStorage cache first (instant display)
        try {
          const cached = localStorage.getItem('tryhushly-profile-v1')
          if (cached) {
            const cachedProfile = JSON.parse(cached)
            if (cachedProfile?.auth_id === user.id) {
              set({ profile: cachedProfile, loading: false })
              // Still fetch fresh in background — don't block UI
            }
          }
        } catch {}

        try {
          const { data: existing } = await supabase
            .from('users').select('*').eq('auth_id', user.id).single()

          if (existing) {
            // Update cache for next load
            try { localStorage.setItem('tryhushly-profile-v1', JSON.stringify(existing)) } catch {}
            set({ profile: existing, loading: false })
            return
          }

          // New user — create profile
          const meta = user.user_metadata || {}
          const { data: created } = await supabase
            .from('users').insert({
              auth_id:          user.id,
              full_name:        meta.full_name || null,
              display_name:     (meta.full_name || '').split(' ')[0] || null,
              username:         meta.username  || null,
              email:            user.email     || null,
              email_verified:   !!user.email_confirmed_at,
              is_anonymous:     false,
              privacy_settings: DEFAULT_PRIVACY,
            }).select('*').single()

          set({ profile: created ?? null, loading: false })
        } catch {
          set({ loading: false })
        } finally {
          profileFetchLock = false
        }
      }

      // ── Step 1: Get current session ────────────────────────
      const { data: { session } } = await supabase.auth.getSession()
      set({ supaUser: session?.user ?? null })

      if (session?.user) {
        await ensureProfile(session.user)
        set({ initialized: true })
      } else {
        set({ loading: false, initialized: true })
      }

      // ── Step 2: Listen for auth changes (login/logout) ─────
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          const currentUser = session?.user ?? null
          set({ supaUser: currentUser })

          if (currentUser) {
            // Reset lock if it's a different user (e.g. account switch)
            if (profileFetchedForUserId !== currentUser.id) {
              profileFetchLock = false
              profileFetchedForUserId = null
            }
            set({ loading: true })
            try {
              await ensureProfile(currentUser)
            } catch {
              set({ loading: false })
            }
            set({ initialized: true })
          } else {
            // Signed out
            profileFetchLock = false
            profileFetchedForUserId = null
            set({ profile: null, loading: false, initialized: true })
          }
        }
      )

      return () => subscription.unsubscribe()
    },
  }))
)

export const selectIsLoggedIn = (s: UserStore) => !!s.supaUser && !!s.profile
export const selectProfile    = (s: UserStore) => s.profile
export const selectLoading    = (s: UserStore) => s.loading
