import type { CarePlanGoal } from '@/types/database'

function mergeField(a: string, b: string): string {
  const av = a.trim()
  const bv = b.trim()
  if (!bv || av === bv) return av
  if (!av) return bv
  return `${av}\n${bv}`
}

// 「解決すべき課題（ニーズ）」が完全に一致する行を1件にまとめる。
// 長期目標／短期目標／サービス内容／頻度は、内容が異なれば改行で連結して残す。
export function mergeGoalsBySameIssue(goals: CarePlanGoal[]): CarePlanGoal[] {
  const merged: CarePlanGoal[] = []
  for (const g of goals) {
    const issue = g.issue.trim()
    const existing = issue ? merged.find(m => m.issue.trim() === issue) : undefined
    if (existing) {
      existing.longTermGoal = mergeField(existing.longTermGoal, g.longTermGoal)
      existing.shortTermGoal = mergeField(existing.shortTermGoal, g.shortTermGoal)
      existing.serviceContent = mergeField(existing.serviceContent, g.serviceContent)
      existing.frequency = mergeField(existing.frequency, g.frequency)
    } else {
      merged.push({ ...g })
    }
  }
  return merged
}
