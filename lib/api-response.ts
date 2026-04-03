/**
 * Consistent API response helpers
 * All API routes should use these for consistent error formats
 */
import { NextResponse } from 'next/server'

export const ok = (data: any, status = 200) =>
  NextResponse.json({ data }, { status })

export const created = (data: any) =>
  NextResponse.json({ data }, { status: 201 })

export const err = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status })

export const unauthorized = () =>
  NextResponse.json({ error: 'Sign in required' }, { status: 401 })

export const forbidden = () =>
  NextResponse.json({ error: 'Access denied' }, { status: 403 })

export const notFound = (what = 'Resource') =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 })

export const tooMany = (msg = 'Too many requests. Please slow down.') =>
  NextResponse.json({ error: msg }, { status: 429, headers: { 'Retry-After': '60' } })

export const serverError = (e?: any) => {
  // Never expose internal error details to client
  const isDev = process.env.NODE_ENV === 'development'
  return NextResponse.json(
    { error: isDev ? (e?.message || 'Internal server error') : 'Something went wrong. Please try again.' },
    { status: 500 }
  )
}
