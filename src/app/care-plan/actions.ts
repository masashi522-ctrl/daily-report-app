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

  const issueList          = formData.getAll('goalIssue') as string[]
  const longTermGoalList   = formData.getAll('goalLongTerm') as string[]
  const shortTermGoalList  = formData.getAll('goalShortTerm') as string[]
  const serviceContentList = formData.getAll('goalService') as string[]
  const frequencyList      = formData.getAll('goalFrequency') as string[]

  const goals: CarePlanGoal[] = issueList
    .map((_, i) => ({
      issue: issueList[i]?.trim() ?? '',
      longTermGoal: longTermGoalList[i]?.trim() ?? '',
      shortTermGoal: shortTermGoalList[i]?.trim() ?? '',
      serviceContent: serviceContentList[i]?.trim() ?? '',
      frequency: frequencyList[i]?.trim() ?? '',
    }))
    .filter(g => g.issue || g.longTermGoal || g.shortTermGoal || g.serviceContent || g.frequency)

  const { data: existing } = await supabase
    .from('CarePlan')
    .select('id')
    .eq('residentId', residentId)
    .maybeSingle()

  const payload = {
    planDate, staffName, birthDate, careLevel, needsAnalysis, supportPolicy, goalImage,
    goals, monitoringDate, evaluationPeriodStart, evaluationPeriodEnd, evaluationContent,
    explanationDate, explainerName, familyConfirmation, proxySigner,
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('CarePlan').update(payload).eq('id', existing.id)
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('CarePlan').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      ...payload,
      createdAt: new Date().toISOString(),
    })
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  }

  revalidatePath('/care-plan')
  return { success: true }
}
