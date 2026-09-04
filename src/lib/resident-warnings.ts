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

/**
 * 利用開始日が未入力のまま記録がある方のID。
 * 開始日が無いと、実際に利用を始める前の月にも集計対象として並び、
 * 月次報告の「新規利用開始」にも出てこない。
 */
export async function residentIdsMissingServiceStart(
  residents: { id: string; serviceStartDate?: string | null }[],
): Promise<string[]> {
  const candidates = residents
    .filter(r => !String(r.serviceStartDate ?? '').trim())
    .map(r => r.id)
  if (candidates.length === 0) return []

  const withRecords = await residentIdsWithRecords(candidates)
  return candidates.filter(id => withRecords.has(id))
}
