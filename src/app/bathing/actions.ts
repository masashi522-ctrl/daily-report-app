'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { DailyRecord } from '@/types/database'

export interface BathingDraft {
  residentId: string
  date: string
  id?: string
  bathing?: string
  bathingSkipReason?: string | null
  bathingSkipDetail?: string | null
  bathingNote?: string | null
  bathingCareChecks?: string | null
}

export interface SaveBathingResult {
  data: DailyRecord | null
  error: string | null
}

export async function saveBathingRecord(draft: BathingDraft): Promise<SaveBathingResult> {
  await requireSession()

  const payload = {
    bathing: draft.bathing ?? 'NOT_APPLICABLE',
    bathingSkipReason: draft.bathingSkipReason ?? null,
    bathingSkipDetail: draft.bathingSkipDetail ?? null,
    bathingNote: draft.bathingNote ?? null,
    bathingCareChecks: draft.bathingCareChecks ?? null,
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
    if (error) {
      console.error('[bathing UPDATE error]', error)
      return { data: null, error: error.message }
    }
    revalidatePath('/bathing')
    revalidatePath('/analytics')
    return { data: saved as DailyRecord, error: null }
  } else {
    const { data: saved, error } = await supabase
      .from('DailyRecord')
      .insert({
        ...payload,
        id: crypto.randomUUID(),
        residentId: draft.residentId,
        date: draft.date,
        trainingDone: false,
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
    if (error) {
      console.error('[bathing INSERT error]', error)
      return { data: null, error: error.message }
    }
    revalidatePath('/bathing')
    revalidatePath('/analytics')
    return { data: saved as DailyRecord, error: null }
  }
}

export async function saveAllBathing(drafts: BathingDraft[]): Promise<SaveBathingResult[]> {
  await requireSession()
  const results = await Promise.all(drafts.map(saveBathingRecord))
  revalidatePath('/bathing')
  revalidatePath('/analytics')
  return results
}
