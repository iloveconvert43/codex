/**
 * lib/api.ts — Centralized API client
 * PERF: Cache auth token in memory — don't call getSession() on every request
 */

import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface FetchOptions extends RequestInit {
  timeout?: number
  retries?: number
  requireAuth?: boolean
}

// Cache token in memory — avoids getSession() call on every fetch
let _cachedToken: string | null = null
let _tokenExpiry: number = 0

// Exported so other modules (upload.ts, notificationStore) can reuse auth
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const now = Date.now()
    // Use cached token if still valid (with 60s buffer)
    if (_cachedToken && _tokenExpiry > now + 60000) {
      return { Authorization: `Bearer ${_cachedToken}` }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      _cachedToken = session.access_token
      // JWT exp is in seconds
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      _tokenExpiry = (payload.exp || 0) * 1000
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {}
  return {}
}

// Clear cache on auth change
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    _cachedToken = null
    _tokenExpiry = 0
  } else if (session?.access_token) {
    _cachedToken = session.access_token
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      _tokenExpiry = (payload.exp || 0) * 1000
    } catch {}
  }
})

export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 8000, retries = 1, requireAuth = false, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const isReadRequest = method === 'GET' || method === 'HEAD'

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiError('No internet connection.', 0, 'OFFLINE')
  }

  const authHeaders = await getAuthHeader()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...(fetchOptions.headers as Record<string, string> || {})
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, { ...fetchOptions, headers, signal: controller.signal })
    clearTimeout(timer)

    if (res.status === 401) {
      _cachedToken = null
      _tokenExpiry = 0

      // For READ requests: retry WITHOUT auth header so API returns public data
      // This prevents "post not found" errors when token is stale
      if (isReadRequest && !requireAuth) {
        const { Authorization: _, ...headersNoAuth } = headers
        const retryRes = await fetch(url, { ...fetchOptions, headers: headersNoAuth })
        if (retryRes.ok) {
          const ct = retryRes.headers.get('content-type')
          return (ct?.includes('application/json') ? await retryRes.json() : await retryRes.text()) as T
        }
      }

      // For mutations or requireAuth: try refresh, then fail
      if (requireAuth) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession()
          if (refreshed?.session?.access_token) {
            // Retry with new token
            _cachedToken = refreshed.session.access_token
            const payload = JSON.parse(atob(refreshed.session.access_token.split('.')[1]))
            _tokenExpiry = (payload.exp || 0) * 1000
            const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed.session.access_token}` }
            const retryRes = await fetch(url, { ...fetchOptions, headers: retryHeaders })
            if (retryRes.ok) {
              const ct = retryRes.headers.get('content-type')
              return (ct?.includes('application/json') ? await retryRes.json() : await retryRes.text()) as T
            }
          }
        } catch {}
      }

      throw new ApiError('Session expired', 401, 'UNAUTHORIZED')
    }

    const ct = res.headers.get('content-type')
    const data = ct?.includes('application/json') ? await res.json() : await res.text()

    if (!res.ok) {
      const msg = (data as any)?.error || `Request failed (${res.status})`
      throw new ApiError(msg, res.status, (data as any)?.code)
    }

    return data as T
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new ApiError('Request timed out', 408, 'TIMEOUT')
    if (err instanceof ApiError) throw err
    throw new ApiError(err.message || 'Network error', 0, 'NETWORK_ERROR')
  }
}

export const api = {
  get:    <T = any>(url: string, opts?: FetchOptions) => apiFetch<T>(url, { method: 'GET', ...opts }),
  post:   <T = any>(url: string, body?: any, opts?: FetchOptions) => apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body), ...opts }),
  patch:  <T = any>(url: string, body?: any, opts?: FetchOptions) => apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  put:    <T = any>(url: string, body?: any, opts?: FetchOptions) => apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  delete: <T = any>(url: string, opts?: FetchOptions) => apiFetch<T>(url, { method: 'DELETE', ...opts }),
}

export const swrFetcher = (url: string) => apiFetch(url)
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
