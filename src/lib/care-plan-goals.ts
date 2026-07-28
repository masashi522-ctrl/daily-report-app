import type { CarePlanGoal } from '@/types/database'

// 比較用に正規化: 空白・句読点の差やAIの読み取りゆれ（全角/半角）を無視して比較できるようにする
function normalizeForCompare(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[。、．，・･]/g, '')
}

// ほぼ同じ文章かどうかを判定する（完全一致でなくても、AIの読み取りゆれによる
// 細かな表記差異（句読点・空白・語尾の微差など）は同一とみなす）
function isRoughlySame(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length < 10) return false // 短すぎる文字列でのゆるい一致は誤結合の危険があるため対象外
  if (shorter.length / longer.length < 0.8) return false // 長さの差が大きすぎる場合は別内容とみなす

  let commonPrefix = 0
  while (commonPrefix < shorter.length && shorter[commonPrefix] === longer[commonPrefix]) commonPrefix++
  return commonPrefix / shorter.length >= 0.85
}

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

// 複数件をまとめる際、対応関係が分かるよう番号を振って列挙する（1件だけの場合はそのまま）
function numberedJoin(values: string[]): string {
  const nonEmpty = values.map(v => v.trim()).filter(Boolean)
  if (nonEmpty.length <= 1) return nonEmpty[0] ?? ''
  return nonEmpty.map((v, i) => `${CIRCLED_NUMBERS[i] ?? `(${i + 1})`}${v}`).join('\n')
}

interface GoalGroup {
  issue: string
  longTermGoal: string
  shortTermGoals: string[]
  serviceContents: string[]
  frequencies: string[]
}

// 「解決すべき課題（ニーズ）」がほぼ同じ内容の行を1件にまとめる。
// ニーズ・長期目標は共通のものとして1つにし、短期目標・サービス内容・頻度は
// 何番目のニーズに対応するかが分かるよう、番号を振って対応関係を保ったまま列挙する。
export function mergeGoalsBySameIssue(goals: CarePlanGoal[]): CarePlanGoal[] {
  const groups: GoalGroup[] = []
  for (const g of goals) {
    const issue = g.issue.trim()
    const existing = issue ? groups.find(gr => isRoughlySame(gr.issue, issue)) : undefined
    if (existing) {
      if (g.longTermGoal.trim() && !isRoughlySame(existing.longTermGoal, g.longTermGoal)) {
        existing.longTermGoal = existing.longTermGoal
          ? `${existing.longTermGoal}\n${g.longTermGoal.trim()}`
          : g.longTermGoal.trim()
      }
      existing.shortTermGoals.push(g.shortTermGoal)
      existing.serviceContents.push(g.serviceContent)
      existing.frequencies.push(g.frequency)
    } else {
      groups.push({
        issue: g.issue,
        longTermGoal: g.longTermGoal,
        shortTermGoals: [g.shortTermGoal],
        serviceContents: [g.serviceContent],
        frequencies: [g.frequency],
      })
    }
  }

  return groups.map(gr => ({
    issue: gr.issue,
    longTermGoal: gr.longTermGoal,
    shortTermGoal: numberedJoin(gr.shortTermGoals),
    serviceContent: numberedJoin(gr.serviceContents),
    frequency: numberedJoin(gr.frequencies),
  }))
}
