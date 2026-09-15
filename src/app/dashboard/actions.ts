'use server'

import { supabase } from '@/lib/supabase'
import { requireSession, type SessionPayload } from '@/lib/session'
import { isResidentInFacility, residentIdsInFacility } from '@/lib/facility-guard'
import { logAudit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'
import type { DailyRecord } from '@/types/database'

// 新規作成時のみ使用。既存行がない初回保存では、未入力の項目にNULL/falseの
// デフォルト値を入れる必要があるため、フル項目のオブジェクトを組み立てる
function buildNewRecordFields(data: Partial<DailyRecord> & { residentId: string; date: string }, staffId: string) {
  return {
    residentId: data.residentId,
    date: data.date,
    staffId,
    bpSystolic: data.bpSystolic ?? null,
    bpDiastolic: data.bpDiastolic ?? null,
    bpSystolicPm: data.bpSystolicPm ?? null,
    bpDiastolicPm: data.bpDiastolicPm ?? null,
    bpSystolicRecheck: data.bpSystolicRecheck ?? null,
    bpDiastolicRecheck: data.bpDiastolicRecheck ?? null,
    bpSystolicPmRecheck: data.bpSystolicPmRecheck ?? null,
    bpDiastolicPmRecheck: data.bpDiastolicPmRecheck ?? null,
    bpRecheckTimeAm: data.bpRecheckTimeAm ?? null,
    bpRecheckTimePm: data.bpRecheckTimePm ?? null,
    pulse: data.pulse ?? null,
    pulsePm: data.pulsePm ?? null,
    tempMorning: data.tempMorning ?? null,
    tempAfternoon: data.tempAfternoon ?? null,
    vitalsTimeAm: data.vitalsTimeAm ?? null,
    vitalsTimePm: data.vitalsTimePm ?? null,
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

// 既存行の更新時は、このユーザーが実際に編集したフィールドだけを抽出する。
// 全項目を送って上書きすると、その間に別の職員が保存した他項目の入力が
// 消えてしまうため(後勝ち上書き問題)、触っていない項目はUPDATE対象に含めない
const STRUCTURAL_FIELDS = new Set(['residentId', 'date', 'id', 'createdAt', 'updatedAt', 'staffId'])

function pickProvidedFields(data: Partial<DailyRecord> & { residentId: string; date: string }) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!STRUCTURAL_FIELDS.has(key) && value !== undefined) result[key] = value
  }
  return result
}

export type SaveRecordResult = { conflictFields: string[] }

export async function saveRecord(
  data: Partial<DailyRecord> & { residentId: string; date: string },
  baseline?: Partial<DailyRecord>,
): Promise<SaveRecordResult> {
  const session = await requireSession()
  if (!(await isResidentInFacility(data.residentId, session.facilityId))) return { conflictFields: [] }

  const result = await saveRecordInternal(data, baseline, session)

  revalidatePath('/dashboard')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  return result
}

// 施設チェック済みの前提で保存する。一括保存から件数分呼ばれるため再検証しない
async function saveRecordInternal(
  data: Partial<DailyRecord> & { residentId: string; date: string },
  baseline: Partial<DailyRecord> | undefined,
  session: SessionPayload,
): Promise<SaveRecordResult> {
  const { data: rows } = await supabase
    .from('DailyRecord')
    .select('*')
    .eq('date', data.date)
    .eq('residentId', data.residentId)
    .limit(1)
  const existing = rows?.[0] ?? null

  if (existing) {
    const provided = pickProvidedFields(data)

    // baseline = このユーザーが編集を始めた時点でDBにあった値。
    // 今のDB値がbaselineと異なる = その間に別の職員が同じ項目を更新した競合。
    // (今のDB値がこのユーザーの新しい値と偶然同じなら実害がないので競合扱いしない)
    const conflictFields: string[] = []
    if (baseline) {
      const existingRec = existing as Record<string, unknown>
      const baselineRec = baseline as Record<string, unknown>
      for (const key of Object.keys(provided)) {
        if (!(key in baselineRec)) continue
        const baselineVal = baselineRec[key] ?? null
        const currentVal = existingRec[key] ?? null
        const newVal = provided[key] ?? null
        if (baselineVal !== currentVal && currentVal !== newVal) {
          conflictFields.push(key)
        }
      }
    }
    for (const key of conflictFields) delete provided[key]

    const update = {
      ...provided,
      staffId: session.userId,
      updatedAt: new Date().toISOString(),
    }
    await supabase.from('DailyRecord').update(update).eq('id', existing.id)
    await logAudit({
      facilityId: session.facilityId, staffId: session.userId, staffName: session.name,
      action: 'update', targetType: 'DailyRecord', targetId: existing.id,
      summary: conflictFields.length > 0
        ? `${data.date}の日次記録を更新（${conflictFields.length}項目は他職員の更新と競合のためスキップ: ${conflictFields.join(', ')}）`
        : `${data.date}の日次記録を更新`,
    })
    return { conflictFields }
  } else {
    const record = buildNewRecordFields(data, session.userId)
    const id = data.id ?? crypto.randomUUID()
    await supabase.from('DailyRecord').insert({
      ...record,
      id,
      createdAt: new Date().toISOString(),
    })
    await logAudit({
      facilityId: session.facilityId, staffId: session.userId, staffName: session.name,
      action: 'create', targetType: 'DailyRecord', targetId: id,
      summary: `${data.date}の日次記録を作成`,
    })
    return { conflictFields: [] }
  }
}

export async function saveAllRecords(
  entries: { data: Partial<DailyRecord> & { residentId: string; date: string }; baseline?: Partial<DailyRecord> }[]
): Promise<Record<string, string[]>> {
  if (entries.length === 0) return {}
  const session = await requireSession()

  const allowed = await residentIdsInFacility(entries.map(e => e.data.residentId), session.facilityId)
  const results = await Promise.all(
    entries
      .filter(e => allowed.has(e.data.residentId))
      .map(async e => [e.data.residentId, (await saveRecordInternal(e.data, e.baseline, session)).conflictFields] as const)
  )

  revalidatePath('/dashboard')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  return Object.fromEntries(results.filter(([, fields]) => fields.length > 0))
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
      return { success: false, error: '保存に失敗しました' }
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
      return { success: false, error: '保存に失敗しました' }
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
