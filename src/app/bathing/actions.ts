'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export interface BathingDraft {
  residentId: string
  date: string
  id?: string
  bathing?: string
  bathingSkipReason?: string | null
  bathingSkipDetail?: string | null
  bathingNote?: string | null
}

export async function saveBathingRecord(draft: BathingDraft) {
  await requireSession()

  const payload = {
    bathing: draft.bathing ?? 'NOT_APPLICABLE',
    bathingSkipReason: draft.bathingSkipReason ?? null,
    bathingSkipDetail: draft.bathingSkipDetail ?? null,
    bathingNote: draft.bathingNote ?? null,
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
    if (error) console.error('[bathing UPDATE error]', error)
  } else {
    const { error } = await supabase.from('DailyRecord').insert({
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
    if (error) console.error('[bathing INSERT error]', error)
  }

  revalidatePath('/bathing')
}

export async function saveAllBathing(drafts: BathingDraft[]) {
  await requireSession()
  await Promise.all(drafts.map(saveBathingRecord))
  revalidatePath('/bathing')
}
