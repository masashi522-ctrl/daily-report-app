import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import CarePlanClient from './care-plan-client'

export default async function CarePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string }>
}) {
  const session = await requireSession()
  const { resident: residentId = '' } = await searchParams

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, careLevel')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)

  const residents = (residentsRaw ?? []).sort((a, b) =>
    (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'),
  )

  let plan = null
  if (residentId) {
    const { data } = await supabase
      .from('CarePlan')
      .select('*')
      .eq('residentId', residentId)
      .maybeSingle()
    plan = data
  }

  const selectedResident = residentId ? (residents.find(r => r.id === residentId) ?? null) : null

  return (
    <CarePlanClient
      residents={residents}
      selectedResidentId={residentId}
      selectedResident={selectedResident}
      plan={plan}
    />
  )
}
