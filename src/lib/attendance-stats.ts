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
  const [h, m] = t.split(/[:：]/).map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

// ── 特記事項からの読み取り ──────────────────────────────────────
//
// 特記事項には血糖値の測定時刻（「BS254 朝 301 15時」など）も書かれるため、
// 時刻らしきものを片端から拾うと利用時間と取り違える。
// 「利用時間」などの見出しに続く時刻だけを読む。

/** 見出しに使える言葉。表記ゆれを吸収する */
const TIME_LABEL = '(?:利用|提供|サービス)?\\s*時間\\s*(?:変更)?'
// 区切りは半角・全角のハイフンや波線、「から」のいずれでも受ける
const TIME_SEPARATOR = '(?:[-~〜～ー―–—－‐]|から)'
const TIME_CHANGE_RE = new RegExp(
  `${TIME_LABEL}[\\s:：]*([0-9]{1,2}[:：][0-9]{2})\\s*${TIME_SEPARATOR}\\s*([0-9]{1,2}[:：][0-9]{2})`,
)

/**
 * 特記事項に書かれた当日の利用時間。
 * 「利用時間 9:30-15:00」「提供時間 9:30〜15:00」「時間変更 9:30～15:00」を読む。
 * 見出しの無い時刻は読まない（血糖値の測定時刻などと区別できないため）。
 */
export function serviceHoursFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null
  const m = TIME_CHANGE_RE.exec(notes)
  if (!m) return null

  const s = toMinutes(m[1])
  const e = toMinutes(m[2])
  if (s == null || e == null || e <= s) return null
  return (e - s) / 60
}

/**
 * 特記事項に書かれた送迎減の回数。迎え・送りをそれぞれ1回として数える。
 * 「送迎なし」は往復とみなして2回。
 * 「無」1文字は「送り無理」のような文にも当たってしまうため、
 * 「なし」「無し」だけを見る。
 */
export function pickupDropCountFromNotes(notes: string | null | undefined): number {
  if (!notes) return 0
  if (/送迎\s*(?:なし|無し)/.test(notes)) return 2

  let n = 0
  if (/迎え?\s*(?:なし|無し)/.test(notes)) n++
  if (/送り?\s*(?:なし|無し)/.test(notes)) n++
  return n
}

/**
 * その利用者の提供時間（時間単位）。
 * 当日の特記事項に利用時間の記載があればそれを最優先する。
 * 無ければ登録されている提供開始・終了時刻、それも無ければ
 * 利用時間区分の下限（'5-6' なら5時間）を使う。
 * どれも無ければ null を返し、平均の計算からは除く
 * （1件も無いのに0時間として平均を下げないため）。
 */
export function serviceHoursOf(r: TimeFields, notes?: string | null): number | null {
  const fromNotes = serviceHoursFromNotes(notes)
  if (fromNotes != null) return fromNotes

  const s = r.serviceStartTime ? toMinutes(r.serviceStartTime) : null
  const e = r.serviceEndTime ? toMinutes(r.serviceEndTime) : null
  if (s != null && e != null && e > s) return (e - s) / 60

  if (r.serviceTimeCategory) {
    const lower = parseFloat(r.serviceTimeCategory.split('-')[0])
    if (Number.isFinite(lower)) return lower
  }
  return null
}

/** 5.4 → '5.40時間'（小数点第2位まで） */
export function formatHours(hours: number | null): string {
  return hours == null ? '―' : `${hours.toFixed(2)}時間`
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
  /** 特記事項の記載で提供時間を変更した人数 */
  hoursFromNotes: number
  /** 送迎減の回数（迎え・送りをそれぞれ1回として数える） */
  pickupDropCount: number
}

export function emptyDaySummary(): DaySummary {
  return { total: 0, care: 0, support: 0, unset: 0, avgHours: null, hoursUnknown: 0, hoursFromNotes: 0, pickupDropCount: 0 }
}

type ResidentLike = TimeFields & { careLevel?: string | null }

/** 出席している利用者と、その日の特記事項の組から、その日のまとめを作る */
export function summarizeDay(
  attendees: { resident: ResidentLike; specialNotes?: string | null }[],
): DaySummary {
  const s = emptyDaySummary()
  let hoursSum = 0
  let hoursCount = 0

  for (const { resident, specialNotes } of attendees) {
    s.total++
    const group = careGroupOf(resident.careLevel)
    if (group === 'CARE') s.care++
    else if (group === 'SUPPORT') s.support++
    else s.unset++

    if (serviceHoursFromNotes(specialNotes) != null) s.hoursFromNotes++
    s.pickupDropCount += pickupDropCountFromNotes(specialNotes)

    const h = serviceHoursOf(resident, specialNotes)
    if (h == null) s.hoursUnknown++
    else { hoursSum += h; hoursCount++ }
  }

  s.avgHours = hoursCount > 0 ? hoursSum / hoursCount : null
  return s
}
