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

export async function addTemporaryAttendance({ residentId, date }: { residentId: string; date: string }): Promise<{ success: boolean; error?: string }> {
  await requireSession()

  const { data: rows } = await supabase
    .from('DailyRecord').select('id').eq('date', date).eq('residentId', residentId)
    .order('updatedAt', { ascending: false }).limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    const { error } = await supabase
      .from('DailyRecord')
      .update({ isTemporaryAttendance: true, updatedAt: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) {
      console.error('[addTemporary UPDATE error]', error)
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase.from('DailyRecord').insert({
      id: crypto.randomUUID(),
      residentId,
      date,
      isTemporaryAttendance: true,
      bathing: 'NOT_APPLICABLE',
      trainingDone: false,
      medicationMorning: false,
      medicationBeforeLunch: false,
      medicationAfterLunch: false,
      medicationBeforeEvening: false,
      medicationEvening: false,
      oralCare: false,
      isAbsent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    if (error) {
      console.error('[addTemporary INSERT error]', error)
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/bathing')
  revalidatePath('/training')
  return { success: true }
}

export async function removeTemporaryAttendance({ residentId, date }: { residentId: string; date: string }) {
  await requireSession()

  const { data: rows } = await supabase
    .from('DailyRecord').select('id').eq('date', date).eq('residentId', residentId).limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    await supabase.from('DailyRecord').update({ isTemporaryAttendance: false, updatedAt: new Date().toISOString() }).eq('id', existing.id)
  }

  revalidatePath('/dashboard')
  revalidatePath('/bathing')
  revalidatePath('/training')
}
