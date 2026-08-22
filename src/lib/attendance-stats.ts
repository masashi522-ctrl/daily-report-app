import 'server-only'

// 日次記録と月次報告の両方で使う、その日の利用状況の数え方。
// 同じ定義を2か所に書くと必ずずれるため、ここに集約する。

export type CareGroup = 'CARE' | 'SUPPORT' | 'UNSET'

/** 要介護 / 要支援 / 未設定 のどれか */
export function careGroupOf(careLevel: string | null | undefined): CareGroup {
  if (!careLevel) return 'UNSET'
  if (careLevel.startsWith('要介護')) return 'CARE'
  if (careLevel.startsWith('要支援')) return 'SUPPORT'
  return 'UNSET'
}

type TimeFields = {
  serviceStartTime?: string | null
  serviceEndTime?: string | null
  serviceTimeCategory?: string | null
}

function toMinutes(t: string): number | null {
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/**
 * その利用者の提供時間（時間単位）。
 * 提供開始・終了時刻があればそこから求める。無ければ利用時間区分の
 * 下限（'5-6' なら5時間）を使う。どちらも無ければ null を返し、
 * 平均の計算からは除く（1件も無いのに0時間として平均を下げないため）。
 */
export function serviceHoursOf(r: TimeFields): number | null {
  const s = r.serviceStartTime ? toMinutes(r.serviceStartTime) : null
  const e = r.serviceEndTime ? toMinutes(r.serviceEndTime) : null
  if (s != null && e != null && e > s) return (e - s) / 60

  if (r.serviceTimeCategory) {
    const lower = parseFloat(r.serviceTimeCategory.split('-')[0])
    if (Number.isFinite(lower)) return lower
  }
  return null
}

/** 5.4 → '5時間24分' */
export function formatHours(hours: number | null): string {
  if (hours == null) return '―'
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

export type DaySummary = {
  /** 利用者数（欠席を除く） */
  total: number
  care: number
  support: number
  unset: number
  /** 平均提供時間。提供時間が分かる利用者が1人もいなければ null */
  avgHours: number | null
  /** 提供時間が分からず平均に含めなかった人数 */
  hoursUnknown: number
}

export function emptyDaySummary(): DaySummary {
  return { total: 0, care: 0, support: 0, unset: 0, avgHours: null, hoursUnknown: 0 }
}

type ResidentLike = TimeFields & { careLevel?: string | null }

/** 出席している利用者の一覧から、その日のまとめを作る */
export function summarizeDay(attendees: ResidentLike[]): DaySummary {
  const s = emptyDaySummary()
  let hoursSum = 0
  let hoursCount = 0

  for (const r of attendees) {
    s.total++
    const group = careGroupOf(r.careLevel)
    if (group === 'CARE') s.care++
    else if (group === 'SUPPORT') s.support++
    else s.unset++

    const h = serviceHoursOf(r)
    if (h == null) s.hoursUnknown++
    else { hoursSum += h; hoursCount++ }
  }

  s.avgHours = hoursCount > 0 ? hoursSum / hoursCount : null
  return s
}
