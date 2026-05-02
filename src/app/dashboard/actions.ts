'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { DailyRecord } from '@/types/database'

export async function saveRecord(data: Partial<DailyRecord> & { residentId: string; date: string }) {
  const session = await requireSession()

  const record = {
    residentId: data.residentId,
    date: data.date,
    staffId: session.userId,
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
    spo2Before: data.spo2Before ?? null,
    spo2After: data.spo2After ?? null,
    weight: data.weight ?? null,
    eyeDrops: data.eyeDrops ?? null,
    insulin: data.insulin ?? null,
    specialNotes: data.specialNotes ?? null,
    updatedAt: new Date().toISOString(),
  }

  if (data.id) {
    await supabase.from('DailyRecord').update(record).eq('id', data.id)
  } else {
    await supabase.from('DailyRecord').insert({ ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
  }

  revalidatePath('/dashboard')
}
