'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { DailyRecord } from '@/types/database'

function buildRecordFields(data: Partial<DailyRecord> & { residentId: string; date: string }, staffId: string) {
  return {
    residentId: data.residentId,
    date: data.date,
    staffId,
    bpSystolic: data.bpSystolic ?? null,
    bpDiastolic: data.bpDiastolic ?? null,
    bpSystolicPm: data.bpSystolicPm ?? null,
    bpDiastolicPm: data.bpDiastolicPm ?? null,
    pulse: data.pulse ?? null,
    pulsePm: data.pulsePm ?? null,
    tempMorning: data.tempMorning ?? null,
    tempAfternoon: data.tempAfternoon ?? null,
    bathing: data.bathing ?? 'NOT_APPLICABLE',
    mealMainFood: data.mealMainFood ?? null,
    mealSideFood: data.mealSideFood ?? null,
    fluidIntakeAm: data.fluidIntakeAm ?? null,
    fluidIntakePm: data.fluidIntakePm ?? null,
    medicationMorning: data.medicationMorning ?? false,
    medicationBeforeLunch: data.medicationBeforeLunch ?? false,
    medicationAfterLunch: data.medicationAfterLunch ?? false,
    medicationEvening: data.medicationEvening ?? false,
    medicationNote: data.medicationNote ?? null,
    functionalTrainingStart: data.functionalTrainingStart ?? null,
    functionalTrainingEnd: data.functionalTrainingEnd ?? null,
    oralCare: data.oralCare ?? false,
    oralCareNote: data.oralCareNote ?? null,
    spo2Before: data.spo2Before ?? null,
    spo2After: data.spo2After ?? null,
    weight: data.weight ?? null,
    eyeDrops: data.eyeDrops ?? null,
    insulin: data.insulin ?? null,
    specialNotes: data.specialNotes ?? null,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveRecord(data: Partial<DailyRecord> & { residentId: string; date: string }) {
  const session = await requireSession()

  const record = buildRecordFields(data, session.userId)

  await supabase.from('DailyRecord').upsert(
    { ...record, id: data.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() },
    { onConflict: 'date,residentId' }
  )

  revalidatePath('/dashboard')
}

export async function saveAllRecords(
  records: (Partial<DailyRecord> & { residentId: string; date: string })[]
) {
  if (records.length === 0) return
  const session = await requireSession()
  const now = new Date().toISOString()

  const toUpsert = records.map(data => ({
    ...buildRecordFields(data, session.userId),
    id: data.id ?? crypto.randomUUID(),
    createdAt: now,
  }))

  await supabase.from('DailyRecord').upsert(toUpsert, { onConflict: 'date,residentId' })
  revalidatePath('/dashboard')
}
