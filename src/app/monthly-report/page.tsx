import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident } from '@/types/database'
import MonthlyReportClient from './monthly-report-client'

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year || String(now.getFullYear()))
  const month = parseInt(params.month || String(now.getMonth() + 1))

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // その月に記録があり欠席でない利用者IDを取得
  const { data: records } = await supabase
    .from('DailyRecord')
    .select('residentId')
    .gte('date', from)
    .lte('date', to)
    .eq('isAbsent', false)

  const recordedIds = [...new Set((records ?? []).map(r => r.residentId))]

  // 記録がある利用者のみ取得
  const { data: residents } = recordedIds.length > 0
    ? await supabase
        .from('Resident')
        .select('*')
        .in('id', recordedIds)
        .eq('isActive', true)
        .eq('facilityId', session.facilityId)
        .order('sortOrder')
        .order('name')
    : { data: [] }

  return (
    <MonthlyReportClient
      residents={(residents ?? []) as Resident[]}
      year={year}
      month={month}
    />
  )
}
