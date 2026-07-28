import type { CarePlanGoal } from '@/types/database'

function mergeField(a: string, b: string): string {
  const av = a.trim()
  const bv = b.trim()
  if (!bv || av === bv) return av
  if (!av) return bv
  return `${av}\n${bv}`
}

// 比較用に正規化: 空白・句読点の差やAIの読み取りゆれ（全角/半角）を無視して比較できるようにする
function normalizeForCompare(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[。、．，・･]/g, '')
}

// ほぼ同じ文章かどうかを判定する（完全一致でなくても、AIの読み取りゆれによる
// 細かな表記差異（句読点・空白・語尾の微差など）は同一課題とみなす）
function isSameIssue(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length < 10) return false // 短すぎる文字列でのゆるい一致は誤結合の危険があるため対象外

  // 長さの差が大きすぎる場合は別内容とみなす
  if (shorter.length / longer.length < 0.8) return false

  // 先頭からの一致文字数を数え、短い方の大部分と一致していれば同一課題と判定する
  let commonPrefix = 0
  while (commonPrefix < shorter.length && shorter[commonPrefix] === longer[commonPrefix]) commonPrefix++

  return commonPrefix / shorter.length >= 0.85
}

// 「解決すべき課題（ニーズ）」がほぼ同じ内容の行を1件にまとめる。
// 長期目標／短期目標／サービス内容／頻度は、内容が異なれば改行で連結して残す。
export function mergeGoalsBySameIssue(goals: CarePlanGoal[]): CarePlanGoal[] {
  const merged: CarePlanGoal[] = []
  for (const g of goals) {
    const issue = g.issue.trim()
    const existing = issue ? merged.find(m => isSameIssue(m.issue, issue)) : undefined
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
