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
    medicationBeforeEvening: data.medicationBeforeEvening ?? false,
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
    isAbsent: data.isAbsent ?? false,
    absenceReason: data.absenceReason ?? null,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveRecord(data: Partial<DailyRecord> & { residentId: string; date: string }) {
  const session = await requireSession()

  const record = buildRecordFields(data, session.userId)

  // Look up existing record to avoid overwriting fields managed by other pages
  const { data: rows } = await supabase
    .from('DailyRecord')
    .select('id, bathing, trainingDone, trainingSkipReason, trainingSkipDetail, trainingNote')
    .eq('date', data.date)
    .eq('residentId', data.residentId)
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    // Preserve fields managed by dedicated pages unless explicitly provided
    const merged = {
      ...record,
      bathing: data.bathing !== undefined ? record.bathing : existing.bathing,
      trainingDone: data.trainingDone !== undefined ? (data.trainingDone ?? false) : existing.trainingDone,
      trainingSkipReason: data.trainingSkipReason !== undefined ? (data.trainingSkipReason ?? null) : existing.trainingSkipReason,
      trainingSkipDetail: data.trainingSkipDetail !== undefined ? (data.trainingSkipDetail ?? null) : existing.trainingSkipDetail,
      trainingNote: data.trainingNote !== undefined ? (data.trainingNote ?? null) : existing.trainingNote,
    }
    await supabase.from('DailyRecord').update(merged).eq('id', existing.id)
  } else {
    await supabase.from('DailyRecord').insert({
      ...record,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    })
  }

  revalidatePath('/dashboard')
}

export async function saveAllRecords(
  records: (Partial<DailyRecord> & { residentId: string; date: string })[]
) {
  if (records.length === 0) return
  await Promise.all(records.map(r => saveRecord(r)))
  revalidatePath('/dashboard')
}
