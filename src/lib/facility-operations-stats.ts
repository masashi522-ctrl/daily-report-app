import { supabase } from '@/lib/supabase'
import {
  CARE_LEVEL_OPTIONS,
  SERVICE_TIME_CATEGORIES,
  type HospitalizationPeriod,
} from '@/types/database'
import { isHospitalizedOn } from '@/lib/hospitalization'

// 予測の補正率と営業曜日を推定するために遡る日数
const LOOKBACK_DAYS = 90
// 直近の実績で「その曜日に営業していた割合」がこの値以上なら営業曜日とみなす
const OPERATING_DOW_THRESHOLD = 0.5

export const UNSET_CARE_LEVEL = '未設定'

// サービス提供時間による按分（5時間以上=1.0人／3時間以上5時間未満=0.5人／3時間未満=0人）
export function weightForHours(hours: number): number {
  if (hours >= 5) return 1
  if (hours >= 3) return 0.5
  return 0
}

/** 利用時間区分（'3-4'など）の下限時間。区分が不正ならnull */
function hoursOfCategory(category: string | null): number | null {
  if (!category) return null
  const lower = parseFloat(category.split('-')[0])
  return Number.isFinite(lower) ? lower : null
}

/** 'H:MM'形式の提供開始・終了時刻から利用時間を求める */
function hoursOfTimeRange(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
  }
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s == null || e == null || e <= s) return null
  return (e - s) / 60
}

export interface Metrics {
  businessDays: number
  /** 延べ利用者数（実人数） */
  totalVisits: number
  /** 按分後の延べ利用者数 */
  weightedVisits: number
  /** 按分後の延べ利用者数 ÷ 営業日数（1日あたりの平均延べ利用者数） */
  avgDailyVisits: number | null
  /** 単純稼働率：実人数 ÷（定員 × 営業日数） */
  occupancyRate: number | null
  /** 実質稼働率：按分後の延べ利用者数 ÷（定員 × 営業日数） */
  effectiveOccupancyRate: number | null
}

export interface MonthSummary {
  year: number
  month: number
  /** 実績（翌月は0） */
  actual: Metrics
  /** 当月は月末見込み、翌月は予測。前月（実績確定）はnull */
  forecast: Metrics | null
}

export interface CompositionRow {
  careLevel: string
  counts: number[]
  total: number
}

export interface Composition {
  categories: string[]
  /** 各時間区分の按分係数（1.0／0.5／0） */
  categoryWeights: number[]
  rows: CompositionRow[]
  columnTotals: number[]
  weightedColumnTotals: number[]
  columnCapacities: (number | null)[]
  grandTotal: number
  weightedGrandTotal: number
  capacity: number | null
}

export interface FiscalYearSummary {
  fiscalYear: number
  /** 期間の途中（今年度）かどうか */
  inProgress: boolean
  metrics: Metrics
}

export interface FacilityOperationsOverview {
  today: string
  capacity: number | null
  capacityByCategory: Record<string, number>
  composition: Composition
  prevMonth: MonthSummary
  currentMonth: MonthSummary
  nextMonth: MonthSummary
  currentFiscalYear: FiscalYearSummary
  previousFiscalYear: FiscalYearSummary
  /** 予定人数に対する実績の比率（欠席・臨時利用を吸収する補正率） */
  forecastRatio: number
  operatingDows: number[]
}

const p2 = (n: number) => String(n).padStart(2, '0')
const round1 = (n: number) => parseFloat(n.toFixed(1))

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function monthStart(year: number, month: number) {
  return `${year}-${p2(month)}-01`
}

function monthEnd(year: number, month: number) {
  return `${year}-${p2(month)}-${p2(daysInMonth(year, month))}`
}

function addMonths(year: number, month: number, diff: number) {
  const total = year * 12 + (month - 1) + diff
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

// 日付文字列の曜日。サーバーのタイムゾーンに影響されないようローカル時刻として解釈する
function dowOf(date: string) {
  return new Date(date + 'T00:00:00').getDay()
}

function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function eachDate(from: string, to: string): string[] {
  const dates: string[] = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) dates.push(d)
  return dates
}

/** 年度（4月始まり）を返す */
export function fiscalYearOf(date: string) {
  const year = parseInt(date.slice(0, 4))
  const month = parseInt(date.slice(5, 7))
  return month >= 4 ? year : year - 1
}

function metricsOf(
  businessDays: number,
  totalVisits: number,
  weightedVisits: number,
  capacity: number | null,
): Metrics {
  const denominator = capacity && businessDays > 0 ? capacity * businessDays : null
  return {
    businessDays,
    totalVisits,
    weightedVisits: round1(weightedVisits),
    avgDailyVisits: businessDays > 0 ? round1(weightedVisits / businessDays) : null,
    occupancyRate: denominator ? round1((totalVisits / denominator) * 100) : null,
    effectiveOccupancyRate: denominator ? round1((weightedVisits / denominator) * 100) : null,
  }
}

type RecordRow = { residentId: string; date: string; isAbsent: boolean }

// PostgRESTの1回あたり取得上限に掛からないよう分割して取得する
async function fetchRecords(residentIds: string[], from: string, to: string): Promise<RecordRow[]> {
  const PAGE = 1000
  const all: RecordRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('residentId, date, isAbsent')
      .in('residentId', residentIds)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    const rows = (data ?? []) as RecordRow[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

export async function computeFacilityOperationsOverview(
  facilityId: string,
  today: string,
): Promise<FacilityOperationsOverview> {
  const year = parseInt(today.slice(0, 4))
  const month = parseInt(today.slice(5, 7))
  const prev = addMonths(year, month, -1)
  const next = addMonths(year, month, 1)
  const fy = fiscalYearOf(today)

  const [{ data: facilityRaw }, { data: residentsRaw }] = await Promise.all([
    supabase.from('Facility').select('capacity, capacityByCategory').eq('id', facilityId).maybeSingle(),
    supabase
      .from('Resident')
      .select(
        'id, careLevel, serviceTimeCategory, serviceStartTime, serviceEndTime, attendanceDays, serviceStartDate, serviceEndDate, hospitalizations, isActive',
      )
      .eq('facilityId', facilityId),
  ])

  const capacity: number | null = facilityRaw?.capacity ?? null
  const capacityByCategory = (facilityRaw?.capacityByCategory ?? {}) as Record<string, number>
  const residents = (residentsRaw ?? []) as {
    id: string
    careLevel: string | null
    serviceTimeCategory: string | null
    serviceStartTime: string | null
    serviceEndTime: string | null
    attendanceDays: string | null
    serviceStartDate: string | null
    serviceEndDate: string | null
    hospitalizations: HospitalizationPeriod[] | null
    isActive: boolean
  }[]
  const hospitalizationsById = new Map(residents.map(r => [r.id, r.hospitalizations]))

  // 利用者ごとの按分係数。時間区分が未設定なら提供開始・終了時刻から求め、
  // どちらも無ければ標準的な提供時間（5時間以上）とみなして1.0人で数える
  const weightOf = (r: (typeof residents)[number]) => {
    const hours = hoursOfCategory(r.serviceTimeCategory) ?? hoursOfTimeRange(r.serviceStartTime, r.serviceEndTime)
    return hours == null ? 1 : weightForHours(hours)
  }
  const weightById = new Map(residents.map(r => [r.id, weightOf(r)]))

  // ── 実績の集計（前年度4月〜翌月末） ──
  const rangeFrom = `${fy - 1}-04-01`
  const rangeTo = monthEnd(next.year, next.month)
  const residentIds = residents.map(r => r.id)
  const records = residentIds.length
    ? (await fetchRecords(residentIds, rangeFrom, rangeTo)).filter(
        // 入院期間中の記録は稼働率・利用実績から除外する
        r => !isHospitalizedOn(hospitalizationsById.get(r.residentId), r.date),
      )
    : []

  // 「営業日」は1件以上の日次記録（利用・欠席）があった日として推定する
  const visitsByDate = new Map<string, { count: number; weighted: number }>()
  for (const rec of records) {
    const cur = visitsByDate.get(rec.date) ?? { count: 0, weighted: 0 }
    if (!rec.isAbsent) {
      cur.count++
      cur.weighted += weightById.get(rec.residentId) ?? 1
    }
    visitsByDate.set(rec.date, cur)
  }
  const businessDates = Array.from(visitsByDate.keys()).sort()

  const aggregate = (from: string, to: string) => {
    let businessDays = 0
    let totalVisits = 0
    let weightedVisits = 0
    for (const date of businessDates) {
      if (date < from || date > to) continue
      businessDays++
      const entry = visitsByDate.get(date)
      totalVisits += entry?.count ?? 0
      weightedVisits += entry?.weighted ?? 0
    }
    return metricsOf(businessDays, totalVisits, weightedVisits, capacity)
  }

  // ── 予測 ──
  const lookbackFrom = shiftDate(today, -LOOKBACK_DAYS)
  const lookbackDates = eachDate(lookbackFrom, today)
  const lookbackBusinessDates = businessDates.filter(d => d >= lookbackFrom && d <= today)

  // 直近の実績から営業曜日を推定する
  const candidateByDow = new Array<number>(7).fill(0)
  const observedByDow = new Array<number>(7).fill(0)
  for (const d of lookbackDates) candidateByDow[dowOf(d)]++
  for (const d of lookbackBusinessDates) observedByDow[dowOf(d)]++
  let operatingDows = [0, 1, 2, 3, 4, 5, 6].filter(
    dow =>
      candidateByDow[dow] > 0 &&
      observedByDow[dow] / candidateByDow[dow] >= OPERATING_DOW_THRESHOLD,
  )
  if (operatingDows.length === 0) {
    // 実績がまだ無い施設向けのフォールバック：利用者マスタの利用曜日から推定する
    const fromMaster = new Set<number>()
    for (const r of residents) {
      if (!r.isActive) continue
      for (const dow of r.attendanceDays?.split(',').map(Number) ?? [1, 2, 3, 4, 5, 6]) {
        fromMaster.add(dow)
      }
    }
    operatingDows = Array.from(fromMaster).sort()
    if (operatingDows.length === 0) operatingDows = [1, 2, 3, 4, 5, 6]
  }

  // その日に利用予定の在籍者数（利用曜日・利用開始/終了日・入院期間を考慮）と、その按分後の人数
  const scheduledOn = (date: string) => {
    const dow = dowOf(date)
    let count = 0
    let weighted = 0
    for (const r of residents) {
      if (!r.isActive) continue
      if (r.attendanceDays && !r.attendanceDays.split(',').map(Number).includes(dow)) continue
      if (r.serviceStartDate && r.serviceStartDate > date) continue
      if (r.serviceEndDate && r.serviceEndDate < date) continue
      if (isHospitalizedOn(r.hospitalizations, date)) continue
      count++
      weighted += weightById.get(r.id) ?? 1
    }
    return { count, weighted }
  }

  // 予定人数に対する実績の比率。欠席や臨時利用をまとめて吸収する補正率として使う
  let scheduledInLookback = 0
  let actualInLookback = 0
  for (const d of lookbackBusinessDates) {
    scheduledInLookback += scheduledOn(d).count
    actualInLookback += visitsByDate.get(d)?.count ?? 0
  }
  const forecastRatio = scheduledInLookback > 0 ? actualInLookback / scheduledInLookback : 1

  const predictedVisits = (dates: string[]) => {
    let count = 0
    let weighted = 0
    for (const d of dates) {
      const s = scheduledOn(d)
      count += s.count
      weighted += s.weighted
    }
    return { count: Math.round(count * forecastRatio), weighted: weighted * forecastRatio }
  }

  const operatingDatesIn = (y: number, m: number, after?: string) =>
    eachDate(monthStart(y, m), monthEnd(y, m)).filter(
      d => (after ? d > after : true) && operatingDows.includes(dowOf(d)),
    )

  const currentActual = aggregate(monthStart(year, month), today)
  // 本日分がまだ未入力なら、本日も残りの営業日として見込みに含める
  const remainingDates = operatingDatesIn(year, month, today)
  if (!visitsByDate.has(today) && operatingDows.includes(dowOf(today))) {
    remainingDates.unshift(today)
  }
  const remainingPrediction = predictedVisits(remainingDates)
  const currentForecast = metricsOf(
    currentActual.businessDays + remainingDates.length,
    currentActual.totalVisits + remainingPrediction.count,
    currentActual.weightedVisits + remainingPrediction.weighted,
    capacity,
  )

  const nextDates = operatingDatesIn(next.year, next.month)
  const nextPrediction = predictedVisits(nextDates)
  const nextForecast = metricsOf(
    nextDates.length,
    nextPrediction.count,
    nextPrediction.weighted,
    capacity,
  )

  // ── 介護度 × 利用時間の構成（在籍中の利用者） ──
  const activeResidents = residents.filter(r => r.isActive)
  const levelOf = (careLevel: string | null) =>
    careLevel && (CARE_LEVEL_OPTIONS as readonly string[]).includes(careLevel)
      ? careLevel
      : UNSET_CARE_LEVEL

  const careLevels: string[] = [...CARE_LEVEL_OPTIONS]
  if (activeResidents.some(r => levelOf(r.careLevel) === UNSET_CARE_LEVEL)) {
    careLevels.push(UNSET_CARE_LEVEL)
  }
  const shownCategories = SERVICE_TIME_CATEGORIES.filter(
    cat => capacityByCategory[cat] != null || activeResidents.some(r => r.serviceTimeCategory === cat),
  )
  const categories: string[] =
    shownCategories.length > 0 ? [...shownCategories] : [...SERVICE_TIME_CATEGORIES]

  const rows: CompositionRow[] = careLevels.map(level => {
    const inLevel = activeResidents.filter(r => levelOf(r.careLevel) === level)
    const counts = categories.map(cat => inLevel.filter(r => r.serviceTimeCategory === cat).length)
    return { careLevel: level, counts, total: counts.reduce((a, b) => a + b, 0) }
  })
  const columnTotals = categories.map((_, i) => rows.reduce((sum, r) => sum + r.counts[i], 0))
  const categoryWeights = categories.map(cat => {
    const hours = hoursOfCategory(cat)
    return hours == null ? 1 : weightForHours(hours)
  })
  const weightedColumnTotals = columnTotals.map((n, i) => round1(n * categoryWeights[i]))

  return {
    today,
    capacity,
    capacityByCategory,
    composition: {
      categories,
      categoryWeights,
      rows,
      columnTotals,
      weightedColumnTotals,
      columnCapacities: categories.map(cat => capacityByCategory[cat] ?? null),
      grandTotal: columnTotals.reduce((a, b) => a + b, 0),
      weightedGrandTotal: round1(weightedColumnTotals.reduce((a, b) => a + b, 0)),
      capacity,
    },
    prevMonth: {
      year: prev.year,
      month: prev.month,
      actual: aggregate(monthStart(prev.year, prev.month), monthEnd(prev.year, prev.month)),
      forecast: null,
    },
    currentMonth: { year, month, actual: currentActual, forecast: currentForecast },
    nextMonth: {
      year: next.year,
      month: next.month,
      actual: metricsOf(0, 0, 0, capacity),
      forecast: nextForecast,
    },
    currentFiscalYear: {
      fiscalYear: fy,
      inProgress: true,
      metrics: aggregate(`${fy}-04-01`, today),
    },
    previousFiscalYear: {
      fiscalYear: fy - 1,
      inProgress: false,
      metrics: aggregate(`${fy - 1}-04-01`, `${fy}-03-31`),
    },
    forecastRatio,
    operatingDows,
  }
}
