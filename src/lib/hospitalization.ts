import type { HospitalizationPeriod } from '@/types/database'

// 入退院期間から「その日は利用を休んでいるか」を判定する。
//
// 退院した日にそのまま利用を再開できるとは限らず、自宅療養をはさむことがある。
// そのため期間には退院日とは別に利用再開日を持たせ、再開日の前日までは
// 入院中と同じく「休み」として扱う（利用予定に数えない）。

/** 前日（YYYY-MM-DD） */
function prevDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * その期間で利用を休んでいる最終日。まだ戻っていなければ null。
 * 利用再開日が退院日より後なら、その前日まで休みとみなす。
 */
export function awayEndOf(h: HospitalizationPeriod): string | null {
  if (!h.dischargeDate) return null
  if (!h.resumeDate) return h.dischargeDate
  const beforeResume = prevDay(h.resumeDate)
  return beforeResume > h.dischargeDate ? beforeResume : h.dischargeDate
}

/** 入院中か、退院したがまだ利用を再開していないか */
export type AwayStatus = 'HOSPITALIZED' | 'RESTING'

/**
 * その日に利用を休んでいるかと、その理由。休んでいなければ null。
 * 期間が重なっている場合は入院中を優先して返す。
 */
export function awayStatusOn(
  hospitalizations: HospitalizationPeriod[] | null | undefined,
  date: string,
): AwayStatus | null {
  if (!hospitalizations || hospitalizations.length === 0) return null

  let status: AwayStatus | null = null
  for (const h of hospitalizations) {
    if (!h.admissionDate || h.admissionDate > date) continue
    const end = awayEndOf(h)
    if (end && end < date) continue
    if (!h.dischargeDate || h.dischargeDate >= date) return 'HOSPITALIZED'
    status = 'RESTING'
  }
  return status
}

/** その日が入院期間（入院日〜退院日）に含まれるか */
export function isHospitalizedOn(
  hospitalizations: HospitalizationPeriod[] | null | undefined,
  date: string,
): boolean {
  return awayStatusOn(hospitalizations, date) === 'HOSPITALIZED'
}

/**
 * その日は利用を休んでいるか（入院中、または退院後まだ再開していない）。
 * 稼働率の集計と翌月予測では、こちらを使って利用予定から外す。
 */
export function isAwayOn(
  hospitalizations: HospitalizationPeriod[] | null | undefined,
  date: string,
): boolean {
  return awayStatusOn(hospitalizations, date) !== null
}
