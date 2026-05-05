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

  // その日に記録があり欠席でない利用者IDを取得
  const { data: records } = await supabase
    .from('DailyRecord')
    .select('residentId')
    .eq('date', today)
    .eq('isAbsent', false)

  const recordedIds = (records ?? []).map(r => r.residentId)

  // 記録がある利用者のみ取得
  const { data: residents } = recordedIds.length > 0
    ? await supabase
        .from('Resident')
        .select('*')
        .in('id', recordedIds)
        .eq('isActive', true)
        .order('sortOrder')
        .order('name')
    : { data: [] }

  return (
    <ReportClient
      residents={(residents ?? []) as Resident[]}
      date={today}
    />
  )
}
