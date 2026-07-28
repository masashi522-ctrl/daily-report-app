'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type TrainingPlanFormState = { error?: string; success?: boolean } | null

export async function saveTrainingPlan(
  residentId: string,
  prevState: TrainingPlanFormState,
  formData: FormData,
): Promise<TrainingPlanFormState> {
  const session = await requireSession()

  const planDate         = (formData.get('planDate') as string) || null
  const nextReviewDate   = (formData.get('nextReviewDate') as string) || null
  const staffName        = (formData.get('staffName') as string)?.trim() || null
  const physicalStatus   = (formData.get('physicalStatus') as string)?.trim() || null
  const userIntention    = (formData.get('userIntention') as string)?.trim() || null
  const familyIntention  = (formData.get('familyIntention') as string)?.trim() || null
  const issues           = (formData.get('issues') as string)?.trim() || null
  const longTermGoal     = (formData.get('longTermGoal') as string)?.trim() || null
  const shortTermGoal    = (formData.get('shortTermGoal') as string)?.trim() || null
  const trainingContent  = (formData.get('trainingContent') as string)?.trim() || null
  const frequency        = (formData.get('frequency') as string)?.trim() || null
  const notes            = (formData.get('notes') as string)?.trim() || null

  const { data: existing } = await supabase
    .from('TrainingPlan')
    .select('id')
    .eq('residentId', residentId)
    .maybeSingle()

  const payload = {
    planDate, nextReviewDate, staffName, physicalStatus, userIntention, familyIntention,
    issues, longTermGoal, shortTermGoal, trainingContent, frequency, notes,
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('TrainingPlan').update(payload).eq('id', existing.id)
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('TrainingPlan').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      ...payload,
      createdAt: new Date().toISOString(),
    })
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  }

  revalidatePath('/training-plan')
  return { success: true }
}
