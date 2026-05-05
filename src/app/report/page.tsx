import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident } from '@/types/database'
import ReportClient from './report-client'

function toDateStr(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireSession()
  const params = await searchParams
  const today = params.date || toDateStr(new Date())

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .order('sortOrder')
    .order('name')

  // その日に記録があるIDを取得（件数バッジ用）
  const { data: records } = await supabase
    .from('DailyRecord')
    .select('residentId')
    .eq('date', today)
    .eq('isAbsent', false)

  const recordedIds = new Set((records ?? []).map(r => r.residentId))

  return (
    <ReportClient
      residents={(residents ?? []) as Resident[]}
      recordedIds={[...recordedIds]}
      date={today}
    />
  )
}
