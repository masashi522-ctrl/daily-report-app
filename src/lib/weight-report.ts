import 'server-only'
import { supabase } from './supabase'
import { overlapsServicePeriod } from './service-period'

// 体重推移の帳票。以前は Excel で書き出していたが、そのまま印刷・PDF保存できるよう
// 画面（/print/weight）で組み立てるようにしたため、集計だけをここに置いている。

export type ReportMonth = { key: string; label: string }

/** 個別：測定した日を1行ずつ */
export type MeasurementRow = { date: string; weight: number; diff: number | null }

/** 全利用者：利用者を1行、月を1列 */
export type ResidentRow = {
  id: string
  name: string
  /** months と同じ並び。その月の最終測定値。測定が無い月は null */
  values: (number | null)[]
  /** 測定のある最初の月から最後の月までの増減。2か月以上そろっている場合のみ */
  diff: number | null
}

export type ResidentWeightReport = {
  months: ReportMonth[]
  resident: { id: string; name: string }
  rows: MeasurementRow[]
  /** 期間内の増減（2回以上測っている場合のみ） */
  change: number | null
}

export type FacilityWeightReport = {
  months: ReportMonth[]
  residents: ResidentRow[]
}

/** 月の数だけ、古い順に「YYYY-MM」と表示名を並べる */
export function reportMonths(count: number, today: string): ReportMonth[] {
  const now = new Date(today)
  const months: ReportMonth[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    })
  }
  return months
}

/** 受け取った月数を1〜12に収める */
export function clampMonths(raw: string | null | undefined) {
  return Math.min(Math.max(parseInt(raw || '3') || 3, 1), 12)
}

/** 選んだ利用者の、日ごとの体重推移 */
export async function loadResidentWeightReport(
  facilityId: string,
  residentId: string,
  monthCount: number,
  today: string,
): Promise<ResidentWeightReport | null> {
  const months = reportMonths(monthCount, today)
  const from = `${months[0].key}-01`

  const { data: resident } = await supabase
    .from('Resident')
    .select('id, name')
    .eq('id', residentId)
    .eq('facilityId', facilityId)
    .maybeSingle()

  if (!resident) return null

  const { data: recordsRaw } = await supabase
    .from('DailyRecord')
    .select('date, weight')
    .eq('residentId', residentId)
    .not('weight', 'is', null)
    .gte('date', from)
    .lte('date', today)
    .order('date', { ascending: true })

  const records = (recordsRaw ?? []).filter(r => r.weight != null) as { date: string; weight: number }[]

  const rows: MeasurementRow[] = records.map((r, i) => ({
    date: r.date,
    weight: r.weight,
    diff: i > 0 ? parseFloat((r.weight - records[i - 1].weight).toFixed(1)) : null,
  }))

  const change = records.length >= 2
    ? parseFloat((records[records.length - 1].weight - records[0].weight).toFixed(1))
    : null

  return { months, resident: { id: resident.id, name: resident.name }, rows, change }
}

/** 全利用者の、月ごとの体重推移 */
export async function loadFacilityWeightReport(
  facilityId: string,
  monthCount: number,
  today: string,
): Promise<FacilityWeightReport> {
  const months = reportMonths(monthCount, today)
  const from = `${months[0].key}-01`

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, isActive, serviceStartDate, serviceEndDate')
    .eq('facilityId', facilityId)

  const ids = (residentsRaw ?? []).map(r => r.id)

  const { data: recordsRaw } = ids.length
    ? await supabase
        .from('DailyRecord')
        .select('residentId, date, weight')
        .in('residentId', ids)
        .not('weight', 'is', null)
        .gte('date', from)
        .lte('date', today)
        .order('date', { ascending: true })
    : { data: [] }

  const records = (recordsRaw ?? []).filter(r => r.weight != null) as
    { residentId: string; date: string; weight: number }[]

  // 対象期間に在籍していた方が対象。期間の途中で利用を終えた方も、測定値がある月までは載せる
  const measuredIds = new Set(records.map(r => r.residentId))
  const residents = (residentsRaw ?? [])
    .filter(r => measuredIds.has(r.id) || (r.isActive && overlapsServicePeriod(r, from, today)))
    .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'))

  // 利用者ごと・月ごとの最終測定値（日付順に読んでいるので、後から来た値で上書きされる）
  const byResidentMonth = new Map<string, Map<string, number>>()
  for (const r of records) {
    const key = r.date.slice(0, 7)
    if (!byResidentMonth.has(r.residentId)) byResidentMonth.set(r.residentId, new Map())
    byResidentMonth.get(r.residentId)!.set(key, r.weight)
  }

  const rows: ResidentRow[] = residents.map(resident => {
    const monthly = byResidentMonth.get(resident.id) ?? new Map<string, number>()
    const values = months.map(m => monthly.get(m.key) ?? null)
    const measured = values.filter((v): v is number => v != null)
    return {
      id: resident.id,
      name: resident.name,
      values,
      diff: measured.length >= 2
        ? parseFloat((measured[measured.length - 1] - measured[0]).toFixed(1))
        : null,
    }
  })

  return { months, residents: rows }
}
