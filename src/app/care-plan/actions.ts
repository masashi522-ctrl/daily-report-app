'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { CarePlanGoal } from '@/types/database'

export type CarePlanFormState = { error?: string; success?: boolean } | null

export async function saveCarePlan(
  residentId: string,
  prevState: CarePlanFormState,
  formData: FormData,
): Promise<CarePlanFormState> {
  const session = await requireSession()

  const planDate              = (formData.get('planDate') as string) || null
  const staffName             = (formData.get('staffName') as string)?.trim() || null
  const birthDate              = (formData.get('birthDate') as string) || null
  const careLevel              = (formData.get('careLevel') as string)?.trim() || null
  const needsAnalysis          = (formData.get('needsAnalysis') as string)?.trim() || null
  const supportPolicy          = (formData.get('supportPolicy') as string)?.trim() || null
  const goalImage              = (formData.get('goalImage') as string)?.trim() || null
  const monitoringDate         = (formData.get('monitoringDate') as string) || null
  const evaluationPeriodStart  = (formData.get('evaluationPeriodStart') as string) || null
  const evaluationPeriodEnd    = (formData.get('evaluationPeriodEnd') as string) || null
  const evaluationContent      = (formData.get('evaluationContent') as string)?.trim() || null
  const explanationDate        = (formData.get('explanationDate') as string) || null
  const explainerName          = (formData.get('explainerName') as string)?.trim() || null
  const familyConfirmation     = (formData.get('familyConfirmation') as string)?.trim() || null
  const proxySigner            = (formData.get('proxySigner') as string)?.trim() || null

  // 要支援の方は介護予防通所介護計画書の様式で保存する
  const isPrevention = formData.get('planType') === 'prevention'

  const issueList          = formData.getAll('goalIssue') as string[]
  const longTermGoalList   = formData.getAll('goalLongTerm') as string[]
  const shortTermGoalList  = formData.getAll('goalShortTerm') as string[]
  const serviceContentList = formData.getAll('goalService') as string[]
  const frequencyList      = formData.getAll('goalFrequency') as string[]
  const goalList           = formData.getAll('goalGoal') as string[]
  const supportPointList   = formData.getAll('goalSupportPoint') as string[]
  const periodList         = formData.getAll('goalPeriod') as string[]

  const rowCount = isPrevention ? goalList.length : issueList.length
  const goals: CarePlanGoal[] = Array.from({ length: rowCount }, (_, i) => ({
    issue: issueList[i]?.trim() ?? '',
    longTermGoal: longTermGoalList[i]?.trim() ?? '',
    shortTermGoal: shortTermGoalList[i]?.trim() ?? '',
    serviceContent: serviceContentList[i]?.trim() ?? '',
    frequency: frequencyList[i]?.trim() ?? '',
    goal: goalList[i]?.trim() ?? '',
    supportPoint: supportPointList[i]?.trim() ?? '',
    period: periodList[i]?.trim() ?? '',
  })).filter(g =>
    g.issue || g.longTermGoal || g.shortTermGoal || g.serviceContent || g.frequency ||
    g.goal || g.supportPoint || g.period,
  )

  const { data: existing } = await supabase
    .from('CarePlan')
    .select('id')
    .eq('residentId', residentId)
    .maybeSingle()

  // 予防様式のときだけ専用項目を保存する（通常様式の保存内容は従来どおり）
  const preventionPayload = isPrevention
    ? {
        gender:           (formData.get('gender') as string)?.trim() || null,
        version:          formData.get('version') ? parseInt(formData.get('version') as string) : null,
        dailyGoal:        (formData.get('dailyGoal') as string)?.trim() || null,
        yearlyGoal:       (formData.get('yearlyGoal') as string)?.trim() || null,
        healthNotes:      (formData.get('healthNotes') as string)?.trim() || null,
        programs:         (formData.getAll('programs') as string[]).join(',') || null,
        serviceStartTime: (formData.get('serviceStartTime') as string) || null,
        serviceEndTime:   (formData.get('serviceEndTime') as string) || null,
      }
    : {}

  const payload = {
    planDate, staffName, birthDate, careLevel, needsAnalysis, supportPolicy, goalImage,
    goals, monitoringDate, evaluationPeriodStart, evaluationPeriodEnd, evaluationContent,
    explanationDate, explainerName, familyConfirmation, proxySigner,
    ...preventionPayload,
    updatedAt: new Date().toISOString(),
  }

  // 予防様式の項目を保存するカラムがまだ無い場合に、原因が分かるようにする
  const describeError = (message: string) =>
    /column .* does not exist|Could not find the .* column/i.test(message)
      ? `保存に失敗しました。介護予防通所介護計画書の項目を保存する列がデータベースにありません（${message}）。Supabaseで列の追加が必要です。`
      : `保存に失敗しました: ${message}`

  if (existing) {
    const { error } = await supabase.from('CarePlan').update(payload).eq('id', existing.id)
    if (error) return { error: describeError(error.message) }
  } else {
    const { error } = await supabase.from('CarePlan').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      ...payload,
      createdAt: new Date().toISOString(),
    })
    if (error) return { error: describeError(error.message) }
  }

  // 「新しい版として保存」が押されたときは、保存時点の内容を控えとして残す
  if (formData.get('saveAsNewVersion') === '1') {
    const { data: saved } = await supabase
      .from('CarePlan')
      .select('*')
      .eq('residentId', residentId)
      .maybeSingle()

    const { data: latest } = await supabase
      .from('CarePlanHistory')
      .select('version')
      .eq('residentId', residentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase.from('CarePlanHistory').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      version: (latest?.version ?? 0) + 1,
      planType: isPrevention ? 'prevention' : 'standard',
      planDate,
      snapshot: saved ?? payload,
      createdAt: new Date().toISOString(),
    })
    if (error) {
      return {
        error: /relation .* does not exist|Could not find the table/i.test(error.message)
          ? `内容は保存しましたが、版の控えを残せませんでした。CarePlanHistoryテーブルがデータベースにありません（${error.message}）。Supabaseでテーブルの作成が必要です。`
          : `内容は保存しましたが、版の控えを残せませんでした: ${error.message}`,
      }
    }
  }

  revalidatePath('/care-plan')
  return { success: true }
}
