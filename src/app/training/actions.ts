'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { isResidentInFacility, residentIdsInFacility } from '@/lib/facility-guard'
import { revalidatePath } from 'next/cache'
import type { DailyRecord } from '@/types/database'

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

export async function saveTrainingRecord(draft: TrainingDraft): Promise<DailyRecord | null> {
  const session = await requireSession()
  if (!(await isResidentInFacility(draft.residentId, session.facilityId))) return null

  const payload = {
    trainingDone: draft.trainingDone ?? false,
    trainingSkipReason: draft.trainingSkipReason ?? null,
    trainingSkipDetail: draft.trainingSkipDetail ?? null,
    trainingNote: draft.trainingNote ?? null,
    functionalTrainingStart: draft.functionalTrainingStart ?? null,
    functionalTrainingEnd: draft.functionalTrainingEnd ?? null,
    updatedAt: new Date().toISOString(),
  }

  // Pick the most-recently-updated record to avoid acting on stale duplicates
  const { data: rows } = await supabase
    .from('DailyRecord')
    .select('id')
    .eq('date', draft.date)
    .eq('residentId', draft.residentId)
    .order('updatedAt', { ascending: false })
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    const { data: saved, error } = await supabase
      .from('DailyRecord')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) console.error('[training UPDATE error]', error)
    revalidatePath('/training')
    revalidatePath('/analytics')
    return (saved as DailyRecord) ?? null
  } else {
    const { data: saved, error } = await supabase
      .from('DailyRecord')
      .insert({
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
      .select('*')
      .single()
    if (error) console.error('[training INSERT error]', error)
    revalidatePath('/training')
    revalidatePath('/analytics')
    return (saved as DailyRecord) ?? null
  }
}

export async function saveAllTraining(drafts: TrainingDraft[]): Promise<(DailyRecord | null)[]> {
  const session = await requireSession()
  const allowed = await residentIdsInFacility(drafts.map(d => d.residentId), session.facilityId)

  const results = await Promise.all(drafts.map(d =>
    allowed.has(d.residentId) ? saveTrainingRecord(d) : Promise.resolve(null)
  ))
  revalidatePath('/training')
  revalidatePath('/analytics')
  return results
}
