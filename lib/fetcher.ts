/**
 * lib/fetcher.ts
 * Simple SWR-compatible fetcher — safe for both SSR and CSR
 */

export const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error('Request failed: ' + res.status)
    return res.json()
  })

// Alias for backward compatibility
export const swrFetcher = fetcher
