import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import WeightClient from './weight-client'

export default async function WeightPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string }>
}) {
  const session = await requireSession()
  const { residentId = '' } = await searchParams

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, weightMeasureEveryVisit, attendanceDays')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)

  const residents = (residentsRaw ?? []).sort((a, b) =>
    (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'),
  )

  let weightRecords: { date: string; weight: number }[] = []
  if (residentId) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('date, weight')
      .eq('residentId', residentId)
      .not('weight', 'is', null)
      .order('date', { ascending: true })
    weightRecords = (data ?? []).filter(r => r.weight != null) as { date: string; weight: number }[]
  }

  const selectedResident = residentId
    ? (residents.find(r => r.id === residentId) ?? null)
    : null

  // JST 今日の日付
  const jstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const thisMonthStart = jstToday.slice(0, 7) + '-01'
  const thisMonthEnd   = jstToday

  // 今月体重測定済みの利用者IDセット
  const { data: measuredThisMonth } = await supabase
    .from('DailyRecord')
    .select('residentId')
    .not('weight', 'is', null)
    .gte('date', thisMonthStart)
    .lte('date', thisMonthEnd)
  const measuredIds = new Set((measuredThisMonth ?? []).map(r => r.residentId))

  // 本日測定済みの利用者IDセット
  const { data: measuredTodayRaw } = await supabase
    .from('DailyRecord')
    .select('residentId')
    .not('weight', 'is', null)
    .eq('date', jstToday)
  const measuredTodayIds = new Set((measuredTodayRaw ?? []).map(r => r.residentId))

  // 「毎回利用時測定」対象者のうち、今日が利用曜日かつ当日未測定
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const residentsAny = residents as any[]
  const jstDayOfWeek = new Date(jstToday + 'T12:00:00+09:00').getDay()
  const todayRequiredIds = new Set<string>(
    residentsAny
      .filter(r => r.weightMeasureEveryVisit)
      .filter(r => {
        if (!r.attendanceDays) return true
        return (r.attendanceDays as string).split(',').map(Number).includes(jstDayOfWeek)
      })
      .filter((r: { id: string }) => !measuredTodayIds.has(r.id))
      .map((r: { id: string }) => r.id),
  )

  return (
    <WeightClient
      residents={residents}
      selectedResidentId={residentId}
      selectedResident={selectedResident}
      weightRecords={weightRecords}
      today={jstToday}
      measuredIds={measuredIds}
      todayRequiredIds={todayRequiredIds}
    />
  )
}
