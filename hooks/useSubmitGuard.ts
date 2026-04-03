/**
 * hooks/useSubmitGuard.ts
 * Prevents duplicate form submissions / button spam.
 */
import { useRef, useCallback } from 'react'

export function useSubmitGuard(cooldownMs = 1000) {
  const lastSubmit = useRef<number>(0)

  const guard = useCallback(<T>(fn: () => T): T | undefined => {
    const now = Date.now()
    if (now - lastSubmit.current < cooldownMs) return undefined
    lastSubmit.current = now
    return fn()
  }, [cooldownMs])

  return guard
}
