export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Debug endpoint — checks if all environment variables are loaded.
 * Does NOT reveal actual values (only presence + prefix).
 */
export async function GET() {
  const check = (key: string, expectPublic = false) => {
    const val = process.env[key]
    return {
      key,
      set: !!val,
      length: val?.length ?? 0,
      prefix: val ? val.slice(0, 12) + '...' : '(empty)',
    }
  }

  const envChecks = [
    check('NEXT_PUBLIC_SUPABASE_URL'),
    check('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    check('SUPABASE_SERVICE_ROLE_KEY'),
    check('NEXT_PUBLIC_IMAGEKIT_URL'),
    check('NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY'),
    check('IMAGEKIT_PRIVATE_KEY'),
    check('UPSTASH_REDIS_REST_URL'),
    check('UPSTASH_REDIS_REST_TOKEN'),
  ]

  // Test signature generation
  let signatureTest = 'not tested'
  try {
    const crypto = require('crypto')
    const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || '').trim()
    if (privateKey) {
      const testSig = crypto.createHmac('sha1', privateKey).update('test1234567890').digest('hex')
      signatureTest = `OK (${testSig.slice(0, 10)}... len=${testSig.length})`
    } else {
      signatureTest = 'FAIL: IMAGEKIT_PRIVATE_KEY is empty'
    }
  } catch (err: any) {
    signatureTest = `ERROR: ${err.message}`
  }

  return NextResponse.json({
    status: 'ok',
    node: process.version,
    env: envChecks,
    signatureTest,
    timestamp: new Date().toISOString(),
  })
}
