'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { toFurigana } from '@/lib/furigana'
import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HospitalizationPeriod } from '@/types/database'

export type ResidentFormState = { error: string } | null

function parseHospitalizations(formData: FormData): HospitalizationPeriod[] {
  const admissions = formData.getAll('hospAdmission') as string[]
  const discharges = formData.getAll('hospDischarge') as string[]
  return admissions
    .map((admissionDate, i) => ({
      admissionDate: admissionDate?.trim() ?? '',
      dischargeDate: discharges[i]?.trim() || null,
    }))
    .filter(h => h.admissionDate)
}

export async function addResident(prevState: ResidentFormState, formData: FormData): Promise<ResidentFormState> {
  const session = await requireSession()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: '名前は必須です' }

  const furigana = (formData.get('furigana') as string)?.trim()
  const foodType = (formData.getAll('foodType') as string[]).join(',')
  const foodRestrictions = formData.get('foodRestrictions') as string
  const specialCondition = formData.get('specialCondition') as string
  const attendanceDays          = (formData.getAll('attendanceDays') as string[]).join(',')
  const bathingDays             = (formData.getAll('bathingDays')    as string[]).join(',')
  const trainingDays            = formData.get('trainingTarget') ? '1' : null
  const careLevel               = (formData.get('careLevel') as string) || null
  const serviceStartTime        = (formData.get('serviceStartTime') as string) || null
  const serviceEndTime          = (formData.get('serviceEndTime') as string) || null
  const serviceTimeCategory     = (formData.get('serviceTimeCategory') as string) || null
  const serviceStartDate        = (formData.get('serviceStartDate') as string) || null
  const serviceEndDate          = (formData.get('serviceEndDate') as string) || null
  const hospitalizations        = parseHospitalizations(formData)
  const weightMeasureEveryVisit  = formData.get('weightMeasureEveryVisit') === '1'
  const bathingCareItems         = (formData.getAll('bathingCareItems') as string[]).join(',') || null
  const bathingSpecialItems      = (formData.getAll('bathingSpecialItems') as string[]).join(',') || null
  const bathingSpecialFreeText   = (formData.get('bathingSpecialFreeText') as string) || null
  const gender                   = (formData.get('gender') as string) || null
  const goalImage                = (formData.get('goalImage') as string)?.trim() || null
  const subGoalImage             = (formData.get('subGoalImage') as string)?.trim() || null

  const { error } = await supabase.from('Resident').insert({
    id: crypto.randomUUID(),
    name,
    furigana: furigana || null,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    isActive: !serviceEndDate,
    attendanceDays:      attendanceDays      || null,
    bathingDays:         bathingDays         || null,
    trainingDays:        trainingDays        || null,
    careLevel,
    serviceStartTime,
    serviceEndTime,
    serviceTimeCategory,
    serviceStartDate,
    serviceEndDate,
    hospitalizations,
    weightMeasureEveryVisit,
    bathingCareItems,
    bathingSpecialItems,
    bathingSpecialFreeText,
    gender,
    goalImage,
    subGoalImage,
    facilityId: session.facilityId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (error) return { error: `登録に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  redirect('/residents')
}

export async function deleteResident(id: string): Promise<{ error?: string }> {
  const session = await requireSession()

  const { count } = await supabase
    .from('DailyRecord')
    .select('id', { count: 'exact', head: true })
    .eq('residentId', id)

  if (count && count > 0) {
    return {
      error: `この利用者には日々の記録が${count}件あるため削除できません。一覧から除外するには「退所」ボタンをご利用ください。`,
    }
  }

  const { error } = await supabase.from('Resident').delete().eq('id', id).eq('facilityId', session.facilityId)
  if (error) return { error: `削除に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  return {}
}

export async function updateResident(id: string, prevState: ResidentFormState, formData: FormData): Promise<ResidentFormState> {
  const session = await requireSession()

  const name = formData.get('name') as string
  const furigana = (formData.get('furigana') as string)?.trim()
  const foodType = (formData.getAll('foodType') as string[]).join(',')
  const foodRestrictions = formData.get('foodRestrictions') as string
  const specialCondition = formData.get('specialCondition') as string
  const attendanceDays          = (formData.getAll('attendanceDays') as string[]).join(',')
  const bathingDays             = (formData.getAll('bathingDays')    as string[]).join(',')
  const trainingDays            = formData.get('trainingTarget') ? '1' : null
  const careLevel               = (formData.get('careLevel') as string) || null
  const serviceStartTime        = (formData.get('serviceStartTime') as string) || null
  const serviceEndTime          = (formData.get('serviceEndTime') as string) || null
  const serviceTimeCategory     = (formData.get('serviceTimeCategory') as string) || null
  const serviceStartDate        = (formData.get('serviceStartDate') as string) || null
  const serviceEndDate          = (formData.get('serviceEndDate') as string) || null
  const hospitalizations        = parseHospitalizations(formData)
  const weightMeasureEveryVisit  = formData.get('weightMeasureEveryVisit') === '1'
  const bathingCareItems         = (formData.getAll('bathingCareItems') as string[]).join(',') || null
  const bathingSpecialItems      = (formData.getAll('bathingSpecialItems') as string[]).join(',') || null
  const bathingSpecialFreeText   = (formData.get('bathingSpecialFreeText') as string) || null
  const gender                   = (formData.get('gender') as string) || null
  const goalImage                = (formData.get('goalImage') as string)?.trim() || null
  const subGoalImage             = (formData.get('subGoalImage') as string)?.trim() || null

  if (!name) return { error: '名前は必須です' }

  const { error } = await supabase.from('Resident').update({
    name,
    furigana: furigana || null,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    attendanceDays:      attendanceDays      || null,
    bathingDays:         bathingDays         || null,
    trainingDays:        trainingDays        || null,
    careLevel,
    serviceStartTime,
    serviceEndTime,
    serviceTimeCategory,
    serviceStartDate,
    serviceEndDate,
    hospitalizations,
    isActive: !serviceEndDate,
    weightMeasureEveryVisit,
    bathingCareItems,
    bathingSpecialItems,
    bathingSpecialFreeText,
    gender,
    goalImage,
    subGoalImage,
    updatedAt: new Date().toISOString(),
  }).eq('id', id).eq('facilityId', session.facilityId)

  if (error) return { error: `更新に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  redirect('/residents')
}

export async function generateFurigana(name: string): Promise<string> {
  if (!name.trim()) return ''
  try {
    return await toFurigana(name.trim())
  } catch {
    return ''
  }
}

export async function generateAllFurigana(): Promise<{ updated: number; errors: number }> {
  await requireSession()
  const { data: residents } = await supabase
    .from('Resident')
    .select('id, name, furigana')
    .is('furigana', null)

  if (!residents || residents.length === 0) return { updated: 0, errors: 0 }

  let updated = 0
  let errors = 0

  for (const r of residents) {
    try {
      const furigana = await toFurigana(r.name)
      if (furigana) {
        await supabase.from('Resident').update({ furigana, updatedAt: new Date().toISOString() }).eq('id', r.id)
        updated++
      }
    } catch {
      errors++
    }
  }

  revalidatePath('/residents')
  revalidatePath('/weight')
  revalidatePath('/analytics')
  return { updated, errors }
}

export async function toggleActive(id: string, isActive: boolean) {
  const session = await requireSession()
  await supabase.from('Resident').update({ isActive, updatedAt: new Date().toISOString() }).eq('id', id).eq('facilityId', session.facilityId)
  revalidatePath('/residents')
  revalidatePath('/weight')
  revalidatePath('/analytics')
}

// 氏名から性別を推定する。あくまで入力補助の候補であり、判断がつかない名前は空を返す。
// 職員が画面で確認・修正できることを前提とした機能。
export async function guessGender(name: string): Promise<string> {
  await requireSession()
  const trimmed = name.trim()
  if (!trimmed) return ''

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            '日本人の氏名から、一般的に想定される性別を推定してください。',
            `氏名: ${trimmed}`,
            '',
            '出力は「男」「女」「不明」のいずれかのみ。説明は一切書かないでください。',
            '薫・真・まこと・あきら・つかさ・ひろみ など、男女どちらにも使われる名前や、',
            '判断の材料が乏しい場合は、推測せず必ず「不明」と答えてください。',
          ].join('\n'),
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return ''
    const answer = textBlock.text.trim()
    if (answer.startsWith('男')) return '男'
    if (answer.startsWith('女')) return '女'
    return ''
  } catch {
    return ''
  }
}
