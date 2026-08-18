import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import TrainingPlanClient from './training-plan-client'

export default async function TrainingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string }>
}) {
  const session = await requireSession()
  const { resident: residentId = '' } = await searchParams

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, careLevel, trainingDays')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)

  // 個別機能訓練加算の対象者（利用者管理で「機能訓練対象」に設定されている方）のみを表示する
  const residents = (residentsRaw ?? [])
    .filter(r => !!r.trainingDays)
    .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'))

  let plan = null
  if (residentId) {
    const { data } = await supabase
      .from('TrainingPlan')
      .select('*')
      .eq('residentId', residentId)
      .maybeSingle()
    plan = data
  }

  const selectedResident = residentId ? (residents.find(r => r.id === residentId) ?? null) : null

  return (
    <TrainingPlanClient
      residents={residents}
      selectedResidentId={residentId}
      selectedResident={selectedResident}
      plan={plan}
      facilityName={session.facilityName}
    />
  )
}
