import 'server-only'
import { supabase } from './supabase'
import { summarizeDay, type DaySummary } from './attendance-stats'

// 月次報告に載せる「日別の利用状況」。
// その日に日次記録があり、欠席でない利用者を「利用者」として数える。
// 稼働率の集計と同じ数え方に揃えている。

export type DailyRow = { date: string; dow: number } & DaySummary

export type MonthlyDailyStats = {
  year: number
  month: number
  rows: DailyRow[]
  /** 合計・平均 */
  totalVisits: number
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
    .select('id, careLevel, serviceTimeCategory, serviceStartTime, serviceEndTime')
    .eq('facilityId', facilityId)

  const residents = residentsRaw ?? []
  const byId = new Map(residents.map(r => [r.id, r]))
  const ids = residents.map(r => r.id)

  // 記録は件数が多くなるため分割して読む
  const records: { residentId: string; date: string; isAbsent: boolean }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('residentId, date, isAbsent')
      .in('residentId', ids.slice(i, i + 200))
      .gte('date', from).lte('date', to)
    records.push(...(data ?? []))
  }

  // 日付ごとの出席者を集める。同じ日に重複した記録があっても1人と数える
  const attendeesByDate = new Map<string, Set<string>>()
  const datesWithRecords = new Set<string>()
  for (const rec of records) {
    datesWithRecords.add(rec.date)
    if (rec.isAbsent) continue
    if (!attendeesByDate.has(rec.date)) attendeesByDate.set(rec.date, new Set())
    attendeesByDate.get(rec.date)!.add(rec.residentId)
  }

  const rows: DailyRow[] = []
  for (let d = 1; d <= monthEnd(year, month); d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    // 記録が1件も無い日は休業日とみなし、行に出さない
    if (!datesWithRecords.has(date)) continue

    const attendees = Array.from(attendeesByDate.get(date) ?? [])
      .map(id => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)

    rows.push({ date, dow: new Date(date + 'T00:00:00').getDay(), ...summarizeDay(attendees) })
  }

  const businessDays = rows.length
  const totalVisits = rows.reduce((n, r) => n + r.total, 0)
  const avg = (pick: (r: DailyRow) => number) =>
    businessDays > 0 ? rows.reduce((n, r) => n + pick(r), 0) / businessDays : null

  // 平均提供時間は、時間が分かる日だけで平均する
  const withHours = rows.filter(r => r.avgHours != null)
  const avgHours = withHours.length > 0
    ? withHours.reduce((n, r) => n + (r.avgHours ?? 0), 0) / withHours.length
    : null

  return {
    year, month, rows, businessDays, totalVisits,
    avgTotal: avg(r => r.total),
    avgCare: avg(r => r.care),
    avgSupport: avg(r => r.support),
    avgHours,
  }
}
