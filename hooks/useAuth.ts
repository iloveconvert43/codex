/**
 * hooks/useAuth.ts
 * 
 * Thin wrapper around Zustand userStore.
 * Keeps backward compatibility with all components that use useAuth().
 * Initialize the store once in layout — subsequent calls just read state.
 */
'use client'

import { useEffect } from 'react'
import { useUserStore, selectIsLoggedIn, selectProfile, selectLoading } from '@/store/userStore'

export function useAuth() {
  const { supaUser, profile, loading, signOut, refreshProfile, initialized, initialize } = useUserStore()
  const isLoggedIn = selectIsLoggedIn({ supaUser, profile, loading, initialized } as any)

  // Initialize on first mount (idempotent — subsequent calls are no-ops)
  useEffect(() => {
    if (initialized) return
    let cleanup: (() => void) | undefined
    initialize().then(fn => { cleanup = fn })
    return () => cleanup?.()
  }, [initialized, initialize])

  return { supaUser, profile, loading, isLoading: loading, signOut, refreshProfile, isLoggedIn }
}

// Export store directly for components that want Zustand selectors
export { useUserStore }
