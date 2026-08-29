'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { isResidentInFacility, residentIdsInFacility } from '@/lib/facility-guard'
import { revalidatePath } from 'next/cache'
import { findOpenHospitalizationIndex } from '@/lib/hospitalization'
import type { DailyRecord, HospitalizationPeriod } from '@/types/database'

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
    spo2Before: data.spo2Before ?? null,
    spo2After: data.spo2After ?? null,
    weight: data.weight ?? null,
    eyeDrops: data.eyeDrops ?? null,
    insulin: data.insulin ?? null,
    specialNotes: data.specialNotes ?? null,
    dailyNote: data.dailyNote ?? null,
    bowelAmount: data.bowelAmount ?? null,
    bowelQuality: data.bowelQuality ?? null,
    isAbsent: data.isAbsent ?? false,
    absenceReason: data.absenceReason ?? null,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveRecord(data: Partial<DailyRecord> & { residentId: string; date: string }) {
  const session = await requireSession()
  if (!(await isResidentInFacility(data.residentId, session.facilityId))) return

  await saveRecordInternal(data, session.userId)

  revalidatePath('/dashboard')
  revalidatePath('/weight')
  revalidatePath('/analytics')
}

// 施設チェック済みの前提で保存する。一括保存から件数分呼ばれるため再検証しない
async function saveRecordInternal(
  data: Partial<DailyRecord> & { residentId: string; date: string },
  staffId: string,
) {
  const record = buildRecordFields(data, staffId)

  // Look up existing record to avoid overwriting fields managed by other pages
  const { data: rows } = await supabase
    .from('DailyRecord')
    .select('id, bathing, trainingDone, trainingSkipReason, trainingSkipDetail, trainingNote, weight')
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
      weight: data.weight !== undefined ? (data.weight ?? null) : existing.weight,
    }
    await supabase.from('DailyRecord').update(merged).eq('id', existing.id)
  } else {
    await supabase.from('DailyRecord').insert({
      ...record,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function saveAllRecords(
  records: (Partial<DailyRecord> & { residentId: string; date: string })[]
) {
  if (records.length === 0) return
  const session = await requireSession()

  const allowed = await residentIdsInFacility(records.map(r => r.residentId), session.facilityId)
  await Promise.all(
    records.filter(r => allowed.has(r.residentId)).map(r => saveRecordInternal(r, session.userId))
  )

  revalidatePath('/dashboard')
  revalidatePath('/weight')
  revalidatePath('/analytics')
}

export async function addTemporaryAttendance({ residentId, date }: { residentId: string; date: string }): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { success: false, error: 'この利用者は操作できません' }
  }

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
  revalidatePath('/analytics')
  return { success: true }
}

export async function removeTemporaryAttendance({ residentId, date }: { residentId: string; date: string }) {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) return

  const { data: rows } = await supabase
    .from('DailyRecord').select('id').eq('date', date).eq('residentId', residentId).limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    await supabase.from('DailyRecord').update({ isTemporaryAttendance: false, updatedAt: new Date().toISOString() }).eq('id', existing.id)
  }

  revalidatePath('/dashboard')
  revalidatePath('/bathing')
  revalidatePath('/training')
  revalidatePath('/analytics')
}

/**
 * 入院中の利用者に利用記録が入力されたとき、記入漏れになっていた退院日をその場で埋める。
 * 退院日が未入力のまま続くと、その利用者の記録が稼働率・利用実績から除外され続けるため。
 * recordDate時点で開いている入院期間だけを対象にする。
 */
export async function setDischargeDate({
  residentId,
  dischargeDate,
  recordDate,
}: {
  residentId: string
  dischargeDate: string
  recordDate: string
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { success: false, error: 'この利用者は操作できません' }
  }
  if (!dischargeDate) return { success: false, error: '退院日を入力してください' }

  const { data: rows, error: fetchError } = await supabase
    .from('Resident').select('hospitalizations').eq('id', residentId).limit(1)
  if (fetchError) {
    console.error('[setDischargeDate SELECT error]', fetchError)
    return { success: false, error: fetchError.message }
  }
  const periods = (rows?.[0]?.hospitalizations ?? []) as HospitalizationPeriod[]

  const index = findOpenHospitalizationIndex(periods, recordDate)
  if (index === -1) return { success: false, error: '退院日が未入力の入院期間が見つかりません' }
  if (dischargeDate < periods[index].admissionDate) {
    return { success: false, error: `退院日は入院日（${periods[index].admissionDate}）より前にできません` }
  }
  // 利用記録がある日より後の退院日は、その記録と矛盾する
  if (dischargeDate > recordDate) {
    return { success: false, error: `退院日は利用日（${recordDate}）より後にできません` }
  }

  const updated = periods.map((h, i) => (i === index ? { ...h, dischargeDate } : h))
  const { error } = await supabase
    .from('Resident')
    .update({ hospitalizations: updated, updatedAt: new Date().toISOString() })
    .eq('id', residentId)
  if (error) {
    console.error('[setDischargeDate UPDATE error]', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/residents')
  revalidatePath('/analytics')
  return { success: true }
}
