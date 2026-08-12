import { supabase } from '@/lib/supabase'
import type { ReportStats, CarePlanSummary } from '@/app/analytics/actions'

function avgNum(arr: (number | null | undefined)[]): number | null {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)) : null
}
function countOf(arr: boolean[]) { return arr.filter(Boolean).length }

export async function computeResidentMonthlyStats(
  residentId: string,
  residentName: string,
  year: number,
  month: number,
): Promise<ReportStats | null> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: recordsRaw } = await supabase
    .from('DailyRecord')
    .select('*')
    .eq('residentId', residentId)
    .gte('date', from)
    .lte('date', to)
  const r = recordsRaw ?? []
  if (r.length === 0) return null

  const attendingRecs = r.filter(x => !x.isAbsent)
  const bathingCount = countOf(r.map(x => x.bathing === 'DONE'))
  const weightValues = r.map(x => x.weight).filter((v): v is number => v != null && v > 0)

  const careNotes = [...r]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(x => [
      x.specialNotes?.trim() ? { date: x.date, label: '特記事項', text: x.specialNotes.trim() } : null,
      x.bathingNote?.trim() ? { date: x.date, label: '入浴', text: x.bathingNote.trim() } : null,
      x.trainingNote?.trim() ? { date: x.date, label: '機能訓練', text: x.trainingNote.trim() } : null,
      x.oralCareNote?.trim() ? { date: x.date, label: '口腔ケア', text: x.oralCareNote.trim() } : null,
    ])
    .filter((v): v is { date: string; label: string; text: string } => v !== null)

  const serviceGaps = [...r]
    .filter(x => !x.isAbsent)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(x => {
      const events: { date: string; label: string; reason: string }[] = []
      if (x.bathing === 'NOT_DONE') {
        events.push({
          date: x.date,
          label: '入浴',
          reason: [x.bathingSkipReason, x.bathingSkipDetail].filter(Boolean).join('：') || '理由不明',
        })
      }
      if (x.trainingDone === false && (x.trainingSkipReason || x.trainingSkipDetail)) {
        events.push({
          date: x.date,
          label: '機能訓練',
          reason: [x.trainingSkipReason, x.trainingSkipDetail].filter(Boolean).join('：') || '理由不明',
        })
      }
      return events
    })

  const { data: carePlanRaw } = await supabase
    .from('CarePlan')
    .select('goalImage, goals')
    .eq('residentId', residentId)
    .maybeSingle()
  const carePlan: CarePlanSummary | null = carePlanRaw
    ? {
        goalImage: carePlanRaw.goalImage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        goals: ((carePlanRaw.goals ?? []) as any[]).map(g => ({
          issue: g.issue ?? '',
          longTermGoal: g.longTermGoal ?? '',
          shortTermGoal: g.shortTermGoal ?? '',
        })),
      }
    : null

  return {
    residentName,
    year,
    month,
    attendanceCount: attendingRecs.length,
    absentCount: r.filter(x => x.isAbsent).length,
    bpSystolicAvg:  avgNum(r.map(x => x.bpSystolic)),
    bpDiastolicAvg: avgNum(r.map(x => x.bpDiastolic)),
    pulseAvg:       avgNum(r.map(x => x.pulse)),
    tempAvg:        avgNum(r.map(x => x.tempMorning)),
    fluidAvg:       avgNum(r.map(x => (x.fluidIntakeAm ?? 0) + (x.fluidIntakePm ?? 0))),
    mealMainAvg:    avgNum(r.map(x => x.mealMainFood)),
    mealSideAvg:    avgNum(r.map(x => x.mealSideFood)),
    bathingCount,
    attendanceForBathing: attendingRecs.length,
    trainingCount:  countOf(r.map(x => x.trainingDone)),
    oralCareCount:  countOf(r.map(x => x.oralCare)),
    weightAvg: weightValues.length ? parseFloat((weightValues.reduce((a, b) => a + b, 0) / weightValues.length).toFixed(1)) : null,
    weightMin: weightValues.length ? Math.min(...weightValues) : null,
    weightMax: weightValues.length ? Math.max(...weightValues) : null,
    weightMeasureCount: weightValues.length,
    careNotes,
    carePlan,
    serviceGaps,
  }
}
