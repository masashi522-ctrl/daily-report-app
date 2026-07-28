'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type CarePlanFormState = { error?: string; success?: boolean } | null

export async function saveCarePlan(
  residentId: string,
  prevState: CarePlanFormState,
  formData: FormData,
): Promise<CarePlanFormState> {
  const session = await requireSession()

  const planDate            = (formData.get('planDate') as string) || null
  const nextReviewDate      = (formData.get('nextReviewDate') as string) || null
  const staffName           = (formData.get('staffName') as string)?.trim() || null
  const careLevel           = (formData.get('careLevel') as string)?.trim() || null
  const lifeIssues          = (formData.get('lifeIssues') as string)?.trim() || null
  const longTermGoal        = (formData.get('longTermGoal') as string)?.trim() || null
  const shortTermGoal       = (formData.get('shortTermGoal') as string)?.trim() || null
  const serviceContent      = (formData.get('serviceContent') as string)?.trim() || null
  const considerations      = (formData.get('considerations') as string)?.trim() || null
  const familyConfirmation  = (formData.get('familyConfirmation') as string)?.trim() || null
  const notes               = (formData.get('notes') as string)?.trim() || null

  const { data: existing } = await supabase
    .from('CarePlan')
    .select('id')
    .eq('residentId', residentId)
    .maybeSingle()

  const payload = {
    planDate, nextReviewDate, staffName, careLevel, lifeIssues, longTermGoal, shortTermGoal,
    serviceContent, considerations, familyConfirmation, notes,
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('CarePlan').update(payload).eq('id', existing.id)
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('CarePlan').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      ...payload,
      createdAt: new Date().toISOString(),
    })
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  }

  revalidatePath('/care-plan')
  return { success: true }
}
