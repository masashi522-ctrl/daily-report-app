import 'server-only'
import { supabase } from './supabase'
import { awayEndOf } from './hospitalization'
import type { HospitalizationPeriod } from '@/types/database'

// 月次報告に載せる「当月の入院・利用中止・新規利用開始」。
// 稼働率が動いた理由を氏名と日程で説明できるようにするための一覧で、
// 入院期間は利用者登録の入退院期間、中止・開始は利用開始日／利用中止日から拾う。

/** 3つの表に共通して出す、利用者そのものの情報 */
type ChangedResident = {
  id: string
  name: string
  careLevel: string | null
  serviceTimeCategory: string | null
  attendanceDays: string | null
}

/** 集計の締め時点での状況。入院中／退院したがまだ利用を再開していない／再開済み */
export type HospitalizedStatus = 'HOSPITALIZED' | 'RESTING' | 'RESUMED'

export type HospitalizedEntry = ChangedResident & {
  admissionDate: string
  dischargeDate: string | null
  /** 登録された利用再開日 */
  resumeDate: string | null
  /**
   * 利用再開日が未入力のときに、退院後で最初に記録があった日。
   * 表示のためだけの推定値で、稼働率や予測には使わない
   */
  estimatedResumeDate: string | null
  reason: string | null
  /** 当月のうち入院していた日数（今月を見ているときは本日まで） */
  hospitalDaysInMonth: number
  /** 当月のうち利用を休んでいた日数。入院に、退院後まだ再開していない期間を足したもの */
  awayDaysInMonth: number
  status: HospitalizedStatus
}

export type ServiceEndEntry = ChangedResident & {
  serviceStartDate: string | null
  serviceEndDate: string
  reason: string | null
  /** 最後に利用した日（欠席を除く）。当月より前のこともある */
  lastVisitDate: string | null
  visitsInMonth: number
}

export type ServiceStartEntry = ChangedResident & {
  serviceStartDate: string
  /** 当月に初めて利用した日（欠席を除く）。まだ来ていなければ null */
  firstVisitDate: string | null
  visitsInMonth: number
}

export type MonthlyChanges = {
  year: number
  month: number
  /** 集計の締め。今月なら本日、過ぎた月ならその月の末日 */
  until: string
  hospitalized: HospitalizedEntry[]
  serviceEnds: ServiceEndEntry[]
  serviceStarts: ServiceStartEntry[]
}

function monthEnd(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** from〜to を含む日数（同じ日なら1日）。to が from より前なら0 */
function daysBetween(from: string, to: string) {
  if (to < from) return 0
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86400000) + 1
}

export async function computeMonthlyChanges(
  facilityId: string,
  year: number,
  month: number,
  /** 集計の基準日。今月は本日、過ぎた月はその月の末日を渡す */
  asOf: string,
): Promise<MonthlyChanges> {
  const mm = String(month).padStart(2, '0')
  const from = `${year}-${mm}-01`
  const to = `${year}-${mm}-${String(monthEnd(year, month)).padStart(2, '0')}`
  // 今月を見ているときに、これから先の入院日数まで数えないようにする
  const until = asOf < to ? asOf : to

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select(
      'id, name, furigana, careLevel, serviceTimeCategory, attendanceDays, serviceStartDate, serviceEndDate, serviceEndReason, hospitalizations',
    )
    .eq('facilityId', facilityId)

  const residents = (residentsRaw ?? []) as {
    id: string
    name: string
    furigana: string | null
    careLevel: string | null
    serviceTimeCategory: string | null
    attendanceDays: string | null
    serviceStartDate: string | null
    serviceEndDate: string | null
    serviceEndReason: string | null
    hospitalizations: HospitalizationPeriod[] | null
  }[]

  // 同じ日に重なったときの並び順は、他の画面と同じくふりがな順に揃える
  const furiganaOf = (r: (typeof residents)[number]) => r.furigana ?? r.name
  const base = (r: (typeof residents)[number]): ChangedResident => ({
    id: r.id,
    name: r.name,
    careLevel: r.careLevel,
    serviceTimeCategory: r.serviceTimeCategory,
    attendanceDays: r.attendanceDays,
  })
  const byDateThenName =
    <T extends { id: string }>(dateOf: (x: T) => string) =>
    (a: T, b: T) => {
      const d = dateOf(a).localeCompare(dateOf(b))
      if (d !== 0) return d
      const fa = residents.find(r => r.id === a.id)
      const fb = residents.find(r => r.id === b.id)
      return (fa ? furiganaOf(fa) : '').localeCompare(fb ? furiganaOf(fb) : '', 'ja')
    }

  // ── 入院者：休んでいた期間が当月と少しでも重なるものを、期間ごとに1行にする ──
  // 退院が前月でも、利用再開が当月なら当月の休みとして出す
  const hospitalized: HospitalizedEntry[] = residents
    .flatMap(r =>
      (r.hospitalizations ?? [])
        .filter(h => h.admissionDate && h.admissionDate <= to)
        .filter(h => {
          const awayEnd = awayEndOf(h)
          return !awayEnd || awayEnd >= from
        })
        .map(h => {
          const windowStart = h.admissionDate > from ? h.admissionDate : from
          const clip = (end: string | null) => (end && end < until ? end : until)
          const awayEnd = awayEndOf(h)
          const status: HospitalizedStatus =
            !h.dischargeDate || h.dischargeDate > until
              ? 'HOSPITALIZED'
              : awayEnd && awayEnd >= until
                ? 'RESTING'
                : 'RESUMED'
          return {
            ...base(r),
            admissionDate: h.admissionDate,
            dischargeDate: h.dischargeDate,
            resumeDate: h.resumeDate ?? null,
            estimatedResumeDate: null as string | null,
            reason: h.reason ?? null,
            hospitalDaysInMonth: daysBetween(windowStart, clip(h.dischargeDate)),
            awayDaysInMonth: daysBetween(windowStart, clip(awayEnd)),
            status,
          }
        }),
    )
    .sort(byDateThenName(h => h.admissionDate))

  // 利用再開日が未入力の方は、退院後で最初に記録がある日を推定値として添える。
  // あくまで表示用で、稼働率や予測の計算には使わない
  await Promise.all(
    hospitalized
      .filter(h => h.dischargeDate && !h.resumeDate && h.dischargeDate <= to)
      .map(async h => {
        // 月末近くに退院した方は翌月に戻ることも多いため、当月内には絞らない
        const { data } = await supabase
          .from('DailyRecord')
          .select('date')
          .eq('residentId', h.id)
          .eq('isAbsent', false)
          .gt('date', h.dischargeDate!)
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (data?.date) h.estimatedResumeDate = data.date
      }),
  )

  // ── 利用中止者・新規利用開始者：利用中止日／利用開始日が当月に入っている方 ──
  const ended = residents.filter(r => r.serviceEndDate && r.serviceEndDate >= from && r.serviceEndDate <= to)
  const started = residents.filter(r => r.serviceStartDate && r.serviceStartDate >= from && r.serviceStartDate <= to)

  const visitIds = Array.from(new Set([...ended, ...started].map(r => r.id)))

  // 当月の利用日（欠席を除く）。中止・開始の対象者だけを読む。
  // 同じ日に記録が重複していても1日と数えるため、日付は集合で持つ
  const visitDatesById = new Map<string, Set<string>>()
  if (visitIds.length > 0) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('residentId, date')
      .in('residentId', visitIds)
      .eq('isAbsent', false)
      .gte('date', from)
      .lte('date', to)
    for (const rec of data ?? []) {
      if (!visitDatesById.has(rec.residentId)) visitDatesById.set(rec.residentId, new Set())
      visitDatesById.get(rec.residentId)!.add(rec.date)
    }
  }
  const visitsOf = (id: string) => Array.from(visitDatesById.get(id) ?? []).sort()

  // 最終利用日は当月より前のこともあるため、中止者ごとに直近の1件を引く
  const lastVisitById = new Map<string, string>()
  await Promise.all(
    ended.map(async r => {
      const { data } = await supabase
        .from('DailyRecord')
        .select('date')
        .eq('residentId', r.id)
        .eq('isAbsent', false)
        .lte('date', r.serviceEndDate!)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.date) lastVisitById.set(r.id, data.date)
    }),
  )

  const serviceEnds: ServiceEndEntry[] = ended
    .map(r => ({
      ...base(r),
      serviceStartDate: r.serviceStartDate,
      serviceEndDate: r.serviceEndDate!,
      reason: r.serviceEndReason,
      lastVisitDate: lastVisitById.get(r.id) ?? null,
      visitsInMonth: visitsOf(r.id).length,
    }))
    .sort(byDateThenName(e => e.serviceEndDate))

  const serviceStarts: ServiceStartEntry[] = started
    .map(r => {
      const dates = visitsOf(r.id)
      return {
        ...base(r),
        serviceStartDate: r.serviceStartDate!,
        firstVisitDate: dates[0] ?? null,
        visitsInMonth: dates.length,
      }
    })
    .sort(byDateThenName(e => e.serviceStartDate))

  return { year, month, until, hospitalized, serviceEnds, serviceStarts }
}
