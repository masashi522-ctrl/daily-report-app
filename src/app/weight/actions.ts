'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { isResidentInFacility } from '@/lib/facility-guard'
import { logAudit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'

export type WeightFormState = { error?: string; success?: boolean } | null

export async function saveWeight(
  residentId: string,
  prevState: WeightFormState,
  formData: FormData,
): Promise<WeightFormState> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { error: 'この利用者は操作できません' }
  }

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
    if (error) {
      console.error('[saveWeight]', error.message)
      return { error: '保存に失敗しました' }
    }
    await logAudit({
      facilityId: session.facilityId, staffId: session.userId, staffName: session.name,
      action: 'update', targetType: 'DailyRecord', targetId: existing.id,
      summary: `${date}の体重を更新`,
    })
  } else {
    const id = crypto.randomUUID()
    const { error } = await supabase.from('DailyRecord').insert({
      id,
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
    if (error) {
      console.error('[saveWeight]', error.message)
      return { error: '保存に失敗しました' }
    }
    await logAudit({
      facilityId: session.facilityId, staffId: session.userId, staffName: session.name,
      action: 'create', targetType: 'DailyRecord', targetId: id,
      summary: `${date}の体重を作成`,
    })
  }

  revalidatePath('/weight')
  revalidatePath('/analytics')
  return { success: true }
}

export async function deleteWeight(residentId: string, date: string): Promise<{ error?: string }> {
  const session = await requireSession()
  if (!residentId || !date) return { error: '無効なリクエストです' }
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { error: 'この利用者は操作できません' }
  }

  const { data: existing } = await supabase
    .from('DailyRecord')
    .select('id')
    .eq('residentId', residentId)
    .eq('date', date)
    .maybeSingle()

  const { error } = await supabase
    .from('DailyRecord')
    .update({ weight: null, updatedAt: new Date().toISOString() })
    .eq('residentId', residentId)
    .eq('date', date)

  if (error) {
    console.error('[deleteWeight]', error.message)
    return { error: '削除に失敗しました' }
  }

  if (existing) {
    await logAudit({
      facilityId: session.facilityId, staffId: session.userId, staffName: session.name,
      action: 'update', targetType: 'DailyRecord', targetId: existing.id,
      summary: `${date}の体重を削除`,
    })
  }

  revalidatePath('/weight')
  revalidatePath('/analytics')
  return {}
}
