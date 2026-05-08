import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import WeightClient from './weight-client'

export default async function WeightPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string }>
}) {
  await requireSession()
  const { residentId = '' } = await searchParams

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana')
    .eq('isActive', true)

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

  return (
    <WeightClient
      residents={residents}
      selectedResidentId={residentId}
      selectedResident={selectedResident}
      weightRecords={weightRecords}
      today={jstToday}
    />
  )
}
