'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { TrainingPlanGoal } from '@/types/database'

export type TrainingPlanFormState = { error?: string; success?: boolean } | null

export async function saveTrainingPlan(
  residentId: string,
  prevState: TrainingPlanFormState,
  formData: FormData,
): Promise<TrainingPlanFormState> {
  const session = await requireSession()

  const planDate                   = (formData.get('planDate') as string) || null
  const previousPlanDate           = (formData.get('previousPlanDate') as string) || null
  const firstPlanDate              = (formData.get('firstPlanDate') as string) || null
  const version                    = Number(formData.get('version')) || 1
  const staffName                  = (formData.get('staffName') as string)?.trim() || null
  const gender                     = (formData.get('gender') as string)?.trim() || null
  const birthDate                  = (formData.get('birthDate') as string) || null
  const careLevel                  = (formData.get('careLevel') as string)?.trim() || null
  const adlIndependenceLevel       = (formData.get('adlIndependenceLevel') as string)?.trim() || null
  const dementiaIndependenceLevel  = (formData.get('dementiaIndependenceLevel') as string)?.trim() || null
  const needsAnalysis              = (formData.get('needsAnalysis') as string)?.trim() || null
  const supportPolicy              = (formData.get('supportPolicy') as string)?.trim() || null
  const goalImage                  = (formData.get('goalImage') as string)?.trim() || null
  const socialParticipation        = (formData.get('socialParticipation') as string)?.trim() || null
  const housingSituation           = (formData.get('housingSituation') as string)?.trim() || null
  const diseaseName                = (formData.get('diseaseName') as string)?.trim() || null
  const onsetDate                  = (formData.get('onsetDate') as string) || null
  const recentAdmissionDate        = (formData.get('recentAdmissionDate') as string) || null
  const recentDischargeDate        = (formData.get('recentDischargeDate') as string) || null
  const trainingPrecautions        = (formData.get('trainingPrecautions') as string)?.trim() || null
  const monitoringDate             = (formData.get('monitoringDate') as string) || null
  const monitoringPeriod           = (formData.get('monitoringPeriod') as string)?.trim() || null
  const monitoringContent          = (formData.get('monitoringContent') as string)?.trim() || null
  const explanationDate            = (formData.get('explanationDate') as string) || null
  const explainerName              = (formData.get('explainerName') as string)?.trim() || null
  const familySignature            = (formData.get('familySignature') as string)?.trim() || null
  const proxySignature             = (formData.get('proxySignature') as string)?.trim() || null

  const issueList          = formData.getAll('goalIssue') as string[]
  const longTermGoalList   = formData.getAll('goalLongTerm') as string[]
  const shortTermGoalList  = formData.getAll('goalShortTerm') as string[]
  const serviceContentList = formData.getAll('goalService') as string[]
  const frequencyList      = formData.getAll('goalFrequency') as string[]

  const goals: TrainingPlanGoal[] = issueList
    .map((_, i) => ({
      issue: issueList[i]?.trim() ?? '',
      longTermGoal: longTermGoalList[i]?.trim() ?? '',
      shortTermGoal: shortTermGoalList[i]?.trim() ?? '',
      serviceContent: serviceContentList[i]?.trim() ?? '',
      frequency: frequencyList[i]?.trim() ?? '',
    }))
    .filter(g => g.issue || g.longTermGoal || g.shortTermGoal || g.serviceContent || g.frequency)

  const { data: existing } = await supabase
    .from('TrainingPlan')
    .select('id')
    .eq('residentId', residentId)
    .maybeSingle()

  const payload = {
    planDate, previousPlanDate, firstPlanDate, version, staffName, gender, birthDate, careLevel,
    adlIndependenceLevel, dementiaIndependenceLevel, needsAnalysis, supportPolicy, goalImage,
    socialParticipation, housingSituation, goals, diseaseName, onsetDate, recentAdmissionDate,
    recentDischargeDate, trainingPrecautions, monitoringDate, monitoringPeriod, monitoringContent,
    explanationDate, explainerName, familySignature, proxySignature,
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase.from('TrainingPlan').update(payload).eq('id', existing.id)
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('TrainingPlan').insert({
      id: crypto.randomUUID(),
      residentId,
      facilityId: session.facilityId,
      ...payload,
      createdAt: new Date().toISOString(),
    })
    if (error) return { error: `保存に失敗しました: ${error.message}` }
  }

  revalidatePath('/training-plan')
  return { success: true }
}
