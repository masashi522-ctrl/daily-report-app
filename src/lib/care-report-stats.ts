// 月次報告書のもとになる集計データを作る。
// 利用者月次報告の画面と、まとめて生成する処理の両方から使うため、画面から切り出している。

import { supabase } from '@/lib/supabase'
import type { ReportStats, CarePlanSummary } from '@/lib/care-report'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any

function avgNum(arr: (number | null | undefined)[]): number | null {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)) : null
}
function countOf(arr: boolean[]) { return arr.filter(Boolean).length }

/** その利用者・その月の記録から、報告書用の集計を作る */
export function computeReportStats(
  residentName: string,
  year: number,
  month: number,
  records: Rec[],
  carePlan: CarePlanSummary | null,
): ReportStats {
  const r = records
  const attendingRecs = r.filter(x => !x.isAbsent)
  const weightValues = r.map(x => x.weight).filter((v): v is number => v != null && v > 0)

  const careNotes = [...r]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(x => [
      x.specialNotes?.trim() ? { date: x.date, label: '特記事項', text: x.specialNotes.trim() } : null,
      x.bathingNote?.trim() ? { date: x.date, label: '入浴', text: x.bathingNote.trim() } : null,
      x.trainingNote?.trim() ? { date: x.date, label: '機能訓練', text: x.trainingNote.trim() } : null,
      // 備考欄は特記事項に統合済み。統合前の記録が残っている場合のみ拾う
      x.oralCareNote?.trim() ? { date: x.date, label: '備考', text: x.oralCareNote.trim() } : null,
      x.dailyNote?.trim() ? { date: x.date, label: 'その日の様子', text: x.dailyNote.trim() } : null,
    ])
    .filter((v): v is { date: string; label: string; text: string } => v !== null)

  // 画面表示・月次報告書への添付用：特記事項欄のみを日付順に抽出
  const dailyNotes = [...r]
    .filter(x => x.specialNotes?.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(x => ({ date: x.date, text: x.specialNotes.trim() }))

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
    bathingCount:   countOf(r.map(x => x.bathing === 'DONE')),
    attendanceForBathing: attendingRecs.length,
    trainingCount:  countOf(r.map(x => x.trainingDone)),
    oralCareCount:  countOf(r.map(x => x.oralCare)),
    weightAvg:          weightValues.length ? parseFloat((weightValues.reduce((a, b) => a + b, 0) / weightValues.length).toFixed(1)) : null,
    weightMin:          weightValues.length ? Math.min(...weightValues) : null,
    weightMax:          weightValues.length ? Math.max(...weightValues) : null,
    weightMeasureCount: weightValues.length,
    careNotes,
    dailyNotes,
    carePlan,
    serviceGaps,
  }
}

/** その利用者の介護計画書（通所介護計画書）を読む */
export async function fetchCarePlanSummary(residentId: string): Promise<CarePlanSummary | null> {
  const { data } = await supabase
    .from('CarePlan')
    .select('goalImage, goals')
    .eq('residentId', residentId)
    .maybeSingle()
  if (!data) return null
  return {
    goalImage: data.goalImage,
    goals: ((data.goals ?? []) as any[]).map(g => ({
      issue: g.issue ?? '',
      longTermGoal: g.longTermGoal ?? '',
      shortTermGoal: g.shortTermGoal ?? '',
    })),
  }
}

/** 利用者IDと年月から、報告書用の集計を丸ごと用意する（まとめて生成する処理から使う） */
export async function loadReportStats(residentId: string, year: number, month: number): Promise<ReportStats | null> {
  const { data: resident } = await supabase
    .from('Resident')
    .select('id, name')
    .eq('id', residentId)
    .maybeSingle()
  if (!resident) return null

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: records } = await supabase
    .from('DailyRecord')
    .select('*')
    .eq('residentId', residentId)
    .gte('date', from)
    .lte('date', to)

  const carePlan = await fetchCarePlanSummary(residentId)
  return computeReportStats(resident.name, year, month, records ?? [], carePlan)
}
