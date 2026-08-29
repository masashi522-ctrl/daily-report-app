/**
 * 利用期間（利用開始日〜利用終了日）の判定。
 * 利用者は利用開始前に登録しておくことがあるため、開始日より前の日付には出さない。
 * 利用終了日も同様に、その日までは出し、翌日から出さない。
 */
export function isInServicePeriod(
  resident: { serviceStartDate?: string | null; serviceEndDate?: string | null },
  date: string,
) {
  if (resident.serviceStartDate && date < resident.serviceStartDate) return false
  if (resident.serviceEndDate && date > resident.serviceEndDate) return false
  return true
}

/**
 * 利用期間が from〜to と少しでも重なるか。
 * 月の途中で利用を開始・終了した方も、その月の集計対象に含めるために使う。
 */
export function overlapsServicePeriod(
  resident: { serviceStartDate?: string | null; serviceEndDate?: string | null },
  from: string,
  to: string,
) {
  if (resident.serviceStartDate && resident.serviceStartDate > to) return false
  if (resident.serviceEndDate && resident.serviceEndDate < from) return false
  return true
}

/** その日の時点で利用終了日を過ぎているか（＝退所済みか） */
export function hasLeftBy(resident: { serviceEndDate?: string | null }, date: string) {
  return !!resident.serviceEndDate && date > resident.serviceEndDate
}

/** 日本時間の今日（YYYY-MM-DD） */
export function jstToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

/**
 * 「利用終了日をまだ過ぎていない」を表す PostgREST の条件。
 * 在籍者を並べる画面で .eq('isActive', true).or(notEndedFilter(jstToday())) のように使い、
 * 終了日を過ぎた方が、誰も編集しなくても翌日から一覧から外れるようにする。
 */
export function notEndedFilter(date: string) {
  return `serviceEndDate.is.null,serviceEndDate.gte.${date}`
}
