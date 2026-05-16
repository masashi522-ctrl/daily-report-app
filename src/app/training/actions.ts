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

  if (draft.id) {
    await supabase.from('DailyRecord').update(payload).eq('id', draft.id)
  } else {
    await supabase.from('DailyRecord').upsert({
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
    }, { onConflict: 'date,residentId' })
  }

  revalidatePath('/training')
}

export async function saveAllTraining(drafts: TrainingDraft[]) {
  await requireSession()
  await Promise.all(drafts.map(saveTrainingRecord))
  revalidatePath('/training')
}
