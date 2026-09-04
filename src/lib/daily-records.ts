// 日次記録をまとめて読むための共通処理。
//
// Supabase（PostgREST）は1回の問い合わせで最大1000件しか返さない。
// 施設全体・1か月分を1回で読もうとすると、げんきむらのように月1,100件を超える施設で
// 静かに取りこぼし、延べ利用者数や日別記録が少なく出る。
// 続きがある限り読み進めるのはこの処理だけにして、画面ごとに書き分けないようにする。

import { supabase } from '@/lib/supabase'

/** 1回の問い合わせで返る上限。PostgRESTの既定値に合わせている */
const PAGE = 1000
/** 一度に条件へ並べる利用者IDの数。多すぎるとURLが長くなりすぎる */
const ID_CHUNK = 200

/**
 * 指定した利用者・期間の日次記録をすべて読む。
 * 利用者IDは200人ずつに分け、それぞれ1000件ずつ続きを読む。
 */
export async function fetchDailyRecords<T = Record<string, unknown>>(
  residentIds: string[],
  from: string,
  to: string,
  columns = '*',
): Promise<T[]> {
  if (residentIds.length === 0) return []

  const all: T[] = []
  for (let i = 0; i < residentIds.length; i += ID_CHUNK) {
    const chunk = residentIds.slice(i, i + ID_CHUNK)
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('DailyRecord')
        .select(columns)
        // ページの境目がずれないよう、並び順を固定する
        .in('residentId', chunk)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('residentId', { ascending: true })
        .range(offset, offset + PAGE - 1)

      if (error) {
        console.error('[fetchDailyRecords] 記録の読み込みに失敗:', error.message)
        break
      }
      const rows = (data ?? []) as T[]
      all.push(...rows)
      if (rows.length < PAGE) break
    }
  }
  return all
}
