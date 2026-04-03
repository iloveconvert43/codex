export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'

type FallbackGif = {
  url: string
  keywords: string[]
}

const FALLBACK_GIFS: FallbackGif[] = [
  { url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', keywords: ['happy', 'dance', 'party', 'trending'] },
  { url: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif', keywords: ['wow', 'surprised', 'funny', 'trending'] },
  { url: 'https://media.giphy.com/media/LmNwrBhejkK9EFP504/giphy.gif', keywords: ['thumbs up', 'like', 'yes', 'good'] },
  { url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif', keywords: ['cat', 'typing', 'work', 'busy'] },
  { url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', keywords: ['laugh', 'lol', 'funny', 'haha'] },
  { url: 'https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/giphy.gif', keywords: ['sad', 'cry', 'emotional'] },
  { url: 'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif', keywords: ['love', 'heart', 'cute'] },
  { url: 'https://media.giphy.com/media/3orieUe6ejxSFxYCXe/giphy.gif', keywords: ['clap', 'congrats', 'celebrate'] },
  { url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', keywords: ['dog', 'cute', 'happy'] },
  { url: 'https://media.giphy.com/media/xTiTnuhyBF54B852nK/giphy.gif', keywords: ['mind blown', 'wow', 'shock'] },
  { url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', keywords: ['angry', 'mad', 'dislike'] },
  { url: 'https://media.giphy.com/media/3og0IPxMM0erATueVW/giphy.gif', keywords: ['hello', 'wave', 'hi'] },
]

function getFallbackResults(query: string, limit: number) {
  const normalized = query.trim().toLowerCase()
  if (!normalized || normalized === 'trending') {
    return FALLBACK_GIFS.slice(0, limit).map((item) => item.url)
  }

  const ranked = FALLBACK_GIFS
    .map((item) => {
      const haystack = item.keywords.join(' ')
      const score = normalized.split(/\s+/).reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0)
      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item.url)

  return (ranked.length ? ranked : FALLBACK_GIFS.map((item) => item.url)).slice(0, limit)
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 16), 1), 24)
    const apiKey = (process.env.GIPHY_API_KEY || process.env.NEXT_PUBLIC_GIPHY_API_KEY || '').trim()

    if (!apiKey) {
      const res = NextResponse.json({ data: getFallbackResults(q, limit), source: 'fallback' })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=g`

    const upstream = await fetch(endpoint, { cache: 'no-store' })
    if (!upstream.ok) {
      const res = NextResponse.json({ data: getFallbackResults(q, limit), source: 'fallback' })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    const payload = await upstream.json()
    const urls = (payload?.data || []).map((gif: any) =>
      gif.images?.fixed_height_small?.url ||
      gif.images?.fixed_height?.url ||
      gif.images?.downsized?.url
    ).filter(Boolean)

    const finalUrls = urls.length ? urls : getFallbackResults(q, limit)
    const res = NextResponse.json({ data: finalUrls, source: urls.length ? 'giphy' : 'fallback' })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[api/gifs]', err.message)
    const res = NextResponse.json({ data: getFallbackResults('', 16), source: 'fallback' })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
}
