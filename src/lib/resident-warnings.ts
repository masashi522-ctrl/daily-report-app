// 利用者登録の入力漏れのうち、集計に影響するものを洗い出す。
// 利用開始日が未入力でも記録は登録できてしまうため、画面側で気づけるようにする。

import { supabase } from '@/lib/supabase'

/** 1回に読む件数。PostgRESTの既定の上限に合わせている */
const PAGE = 1000
/** 記録が多い施設でも読み過ぎないための上限（1000件×20＝2万件） */
const MAX_PAGES = 20

/**
 * 渡した利用者のうち、日次記録が1件でもある方のIDを返す。
 *
 * 全員分の記録を数えると重くなるため、新しい記録から順に読み、
 * 全員が見つかった時点で打ち切る。日々ご利用のある方はたいてい1回の問い合わせで揃う。
 */
export async function residentIdsWithRecords(residentIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  if (residentIds.length === 0) return found

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('residentId')
      .in('residentId', residentIds)
      .order('date', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)

    if (!data || data.length === 0) break
    for (const row of data) found.add(row.residentId as string)
    // 全員見つかった、またはこれ以上記録が無い
    if (found.size >= residentIds.length || data.length < PAGE) break
  }
  return found
}

/** 「最近登録した」とみなす期間。これより前に登録した方は、開始日を今さら
 *  調べるのが難しいことが多いため、開始日なしの警告からは外す */
const RECENT_REGISTRATION_MONTHS = 3

/**
 * この絞り込みを導入した日。アプリ導入からまだ日が浅い施設では、
 * 昔から利用している方も含めて全員がこの数か月以内に登録されているため、
 * 「登録から3か月」だけでは既存の方を絞り込みきれない。
 * 導入日より前に登録された方は、導入日を基準にまとめて対象外にする
 * （導入から3か月経てば、この基準は自然と通常のローリング判定に戻る）。
 */
const WARNING_INTRODUCED_AT = new Date('2026-08-12T00:00:00+09:00')

export function isRecentlyRegistered(createdAt: string, now: Date = new Date()): boolean {
  const rollingThreshold = new Date(now)
  rollingThreshold.setMonth(rollingThreshold.getMonth() - RECENT_REGISTRATION_MONTHS)
  const threshold = rollingThreshold > WARNING_INTRODUCED_AT ? rollingThreshold : WARNING_INTRODUCED_AT
  return new Date(createdAt) >= threshold
}

/**
 * 利用開始日が未入力のまま記録がある方のID。
 * 開始日が無いと、実際に利用を始める前の月にも集計対象として並び、
 * 月次報告の「新規利用開始」にも出てこない。
 *
 * ただし登録から日が経った方は、今さら開始日を調べるのが難しいことが多いため、
 * 直近{@link RECENT_REGISTRATION_MONTHS}か月以内に登録した方に絞って知らせる。
 */
export async function residentIdsMissingServiceStart(
  residents: { id: string; serviceStartDate?: string | null; createdAt: string }[],
  now: Date = new Date(),
): Promise<string[]> {
  const candidates = residents
    .filter(r => !String(r.serviceStartDate ?? '').trim() && isRecentlyRegistered(r.createdAt, now))
    .map(r => r.id)
  if (candidates.length === 0) return []

  const withRecords = await residentIdsWithRecords(candidates)
  return candidates.filter(id => withRecords.has(id))
}
