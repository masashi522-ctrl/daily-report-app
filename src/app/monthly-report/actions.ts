'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import { SERVICE_TIME_CATEGORIES } from '@/types/database'

export type CapacityFormState = { error?: string; savedAt?: string } | null

export async function saveFacilityCapacity(
  prevState: CapacityFormState,
  formData: FormData,
): Promise<CapacityFormState> {
  const session = await requireSession()

  const capacityRaw = (formData.get('capacity') as string) ?? ''
  const capacity = capacityRaw ? parseInt(capacityRaw) : null

  const capacityByCategory: Record<string, number> = {}
  for (const cat of SERVICE_TIME_CATEGORIES) {
    const v = formData.get(`cap_${cat}`) as string
    if (v) capacityByCategory[cat] = parseInt(v)
  }

  const { error } = await supabase
    .from('Facility')
    .update({ capacity, capacityByCategory })
    .eq('id', session.facilityId)

  if (error) return { error: `保存に失敗しました: ${error.message}` }

  revalidatePath('/monthly-report')
  return { savedAt: new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' }) }
}
