import 'server-only'
import { supabase } from './supabase'
import { summarizeDay, careGroupOf, type DaySummary } from './attendance-stats'
import { fetchDailyRecords } from './daily-records'

// 月次報告に載せる「日別の利用状況」。
// その日に日次記録があり、欠席でない利用者を「利用者」として数える。
// 稼働率の集計と同じ数え方に揃えている。

/** その日の内訳。表の日付をクリックしたときに出す */
export type DayNames = {
  care: string[]
  support: string[]
  unset: string[]
  /** 欠席者は要介護か要支援かが分かるように区分を添える（段階の数字までは出さない） */
  absent: { name: string; care: string }[]
}

export type DailyRow = { date: string; dow: number; names: DayNames } & DaySummary

export type MonthlyDailyStats = {
  year: number
  month: number
  rows: DailyRow[]
  /** 合計・平均 */
  totalVisits: number
  /** 送迎減の合計回数 */
  totalPickupDrop: number
  avgTotal: number | null
  avgCare: number | null
  avgSupport: number | null
  avgHours: number | null
  businessDays: number
}

function monthEnd(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export async function computeMonthlyDailyStats(
  facilityId: string,
  year: number,
  month: number,
): Promise<MonthlyDailyStats> {
  const mm = String(month).padStart(2, '0')
  const from = `${year}-${mm}-01`
  const to = `${year}-${mm}-${String(monthEnd(year, month)).padStart(2, '0')}`

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, careLevel, serviceTimeCategory, serviceStartTime, serviceEndTime')
    .eq('facilityId', facilityId)

  const residents = residentsRaw ?? []
  const byId = new Map(residents.map(r => [r.id, r]))
  const ids = residents.map(r => r.id)

  // 内訳に出す氏名は、他の画面と同じくふりがな順に並べる
  const nameOf = (id: string) => byId.get(id)?.name ?? '（不明）'
  const furiganaOf = (id: string) => byId.get(id)?.furigana ?? byId.get(id)?.name ?? ''
  const sortIds = (ids: string[]) =>
    [...ids].sort((a, b) => furiganaOf(a).localeCompare(furiganaOf(b), 'ja'))
  const sortByFurigana = (ids: string[]) => sortIds(ids).map(nameOf)
  const careLabelOf = (id: string) => {
    const group = careGroupOf(byId.get(id)?.careLevel)
    return group === 'CARE' ? '要介護' : group === 'SUPPORT' ? '要支援' : '区分未設定'
  }
  const withCareLabel = (ids: string[]) =>
    sortIds(ids).map(id => ({ name: nameOf(id), care: careLabelOf(id) }))

  // 記録は月1,000件を超えることがあるため、続きまで読む共通処理を使う
  const records = await fetchDailyRecords<{
    residentId: string
    date: string
    isAbsent: boolean
    specialNotes: string | null
  }>(ids, from, to, 'residentId, date, isAbsent, specialNotes')

  // 日付ごとの出席者を集める。同じ日に重複した記録があっても1人と数える。
  // 特記事項は利用時間の変更と送迎減を読み取るために持ち回る
  const attendeesByDate = new Map<string, Map<string, string | null>>()
  // 欠席者も日付ごとに持っておき、表の日付をクリックしたときに名前を出せるようにする
  const absenteesByDate = new Map<string, Set<string>>()
  const datesWithRecords = new Set<string>()
  for (const rec of records) {
    datesWithRecords.add(rec.date)
    if (rec.isAbsent) {
      if (!absenteesByDate.has(rec.date)) absenteesByDate.set(rec.date, new Set())
      absenteesByDate.get(rec.date)!.add(rec.residentId)
      continue
    }
    if (!attendeesByDate.has(rec.date)) attendeesByDate.set(rec.date, new Map())
    attendeesByDate.get(rec.date)!.set(rec.residentId, rec.specialNotes)
  }

  const rows: DailyRow[] = []
  for (let d = 1; d <= monthEnd(year, month); d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    // 記録が1件も無い日は休業日とみなし、行に出さない
    if (!datesWithRecords.has(date)) continue

    const attendees = Array.from(attendeesByDate.get(date) ?? new Map())
      .map(([id, specialNotes]) => {
        const resident = byId.get(id)
        return resident ? { resident, specialNotes } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)

    const attendeeIds = attendees.map(a => a.resident.id)
    const names: DayNames = {
      care:    sortByFurigana(attendeeIds.filter(id => careGroupOf(byId.get(id)?.careLevel) === 'CARE')),
      support: sortByFurigana(attendeeIds.filter(id => careGroupOf(byId.get(id)?.careLevel) === 'SUPPORT')),
      unset:   sortByFurigana(attendeeIds.filter(id => careGroupOf(byId.get(id)?.careLevel) === 'UNSET')),
      absent:  withCareLabel(Array.from(absenteesByDate.get(date) ?? [])),
    }

    rows.push({ date, dow: new Date(date + 'T00:00:00').getDay(), names, ...summarizeDay(attendees) })
  }

  const businessDays = rows.length
  const totalVisits = rows.reduce((n, r) => n + r.total, 0)
  const totalPickupDrop = rows.reduce((n, r) => n + r.pickupDropCount, 0)
  const avg = (pick: (r: DailyRow) => number) =>
    businessDays > 0 ? rows.reduce((n, r) => n + pick(r), 0) / businessDays : null

  // 平均提供時間は、時間が分かる日だけで平均する
  const withHours = rows.filter(r => r.avgHours != null)
  const avgHours = withHours.length > 0
    ? withHours.reduce((n, r) => n + (r.avgHours ?? 0), 0) / withHours.length
    : null

  return {
    year, month, rows, businessDays, totalVisits, totalPickupDrop,
    avgTotal: avg(r => r.total),
    avgCare: avg(r => r.care),
    avgSupport: avg(r => r.support),
    avgHours,
  }
}
