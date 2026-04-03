export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  try {

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('questions')
    .select('id, question_text, category, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add response counts
  const withCounts = await Promise.all(
    (data || []).map(async (q: any) => {
      const { count } = await supabase
        .from('question_responses')
        .select('id', { count: 'exact', head: true })
        .eq('question_id', q.id)
      return { ...q, response_count: count ?? 0 }
    })
  )

  return NextResponse.json({ data: withCounts })
  } catch (err: any) {
    console.error('[questions]', err.message)
    return (await import('next/server')).NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
