export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
type Ctx = { params: { id: string } }


export async function GET(req: NextRequest, { params }: Ctx) {
  try {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ data: { total_points: 0, weekly_points: 0, level: 'curious_newcomer' } })
  }
  return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[route error]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}