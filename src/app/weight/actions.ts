'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type WeightFormState = { error?: string; success?: boolean } | null

export async function saveWeight(
  residentId: string,
  prevState: WeightFormState,
  formData: FormData,
): Promise<WeightFormState> {
  await requireSession()

  const date = (formData.get('date') as string)?.trim()
  const weightStr = formData.get('weight') as string
  const weight = weightStr !== '' ? parseFloat(weightStr) : null

  if (!date) return { error: '日付を入力してください' }
  if (weight == null || isNaN(weight) || weight <= 0) return { error: '体重を正しく入力してください' }

  const { data: existing } = await supabase
    .from('DailyRecord')
    .select('id')
    .eq('residentId', residentId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('DailyRecord')
      .update({ weight, updatedAt: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('DailyRecord').insert({
      id: crypto.randomUUID(),
      residentId,
      date,
      staffId: null,
      bathing: 'NOT_APPLICABLE',
      weight,
      medicationMorning: false,
      medicationBeforeLunch: false,
      medicationAfterLunch: false,
      medicationBeforeEvening: false,
      medicationEvening: false,
      oralCare: false,
      isAbsent: false,
      trainingDone: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  }

  revalidatePath('/weight')
  return { success: true }
}

export async function deleteWeight(residentId: string, date: string): Promise<{ error?: string }> {
  await requireSession()
  if (!residentId || !date) return { error: '無効なリクエストです' }

  const { error } = await supabase
    .from('DailyRecord')
    .update({ weight: null, updatedAt: new Date().toISOString() })
    .eq('residentId', residentId)
    .eq('date', date)

  if (error) return { error: `削除に失敗しました: ${error.message}` }

  revalidatePath('/weight')
  return {}
}
