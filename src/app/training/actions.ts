'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export interface TrainingDraft {
  residentId: string
  date: string
  id?: string
  trainingDone?: boolean
  trainingSkipReason?: string | null
  trainingSkipDetail?: string | null
  trainingNote?: string | null
  functionalTrainingStart?: string | null
  functionalTrainingEnd?: string | null
}

export async function saveTrainingRecord(draft: TrainingDraft) {
  await requireSession()

  const payload = {
    trainingDone: draft.trainingDone ?? false,
    trainingSkipReason: draft.trainingSkipReason ?? null,
    trainingSkipDetail: draft.trainingSkipDetail ?? null,
    trainingNote: draft.trainingNote ?? null,
    functionalTrainingStart: draft.functionalTrainingStart ?? null,
    functionalTrainingEnd: draft.functionalTrainingEnd ?? null,
    updatedAt: new Date().toISOString(),
  }

  // Look up the existing record by date+residentId to get a reliable id
  const { data: rows } = await supabase
    .from('DailyRecord')
    .select('id')
    .eq('date', draft.date)
    .eq('residentId', draft.residentId)
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    const { error } = await supabase.from('DailyRecord').update(payload).eq('id', existing.id)
    if (error) console.error('[training UPDATE error]', error)
  } else {
    const { error } = await supabase.from('DailyRecord').insert({
      ...payload,
      id: crypto.randomUUID(),
      residentId: draft.residentId,
      date: draft.date,
      bathing: 'NOT_APPLICABLE',
      medicationMorning: false,
      medicationBeforeLunch: false,
      medicationAfterLunch: false,
      medicationBeforeEvening: false,
      medicationEvening: false,
      oralCare: false,
      isAbsent: false,
      createdAt: new Date().toISOString(),
    })
    if (error) console.error('[training INSERT error]', error)
  }

  revalidatePath('/training')
}

export async function saveAllTraining(drafts: TrainingDraft[]) {
  await requireSession()
  await Promise.all(drafts.map(saveTrainingRecord))
  revalidatePath('/training')
}
