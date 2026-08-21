import 'server-only'
import { supabase } from './supabase'

// サーバーアクションの引数はクライアントから自由に指定できるため、
// residentId を受け取る処理は必ずログイン中の施設の利用者か確認する。

/** その residentId がログイン中の施設の利用者かどうか */
export async function isResidentInFacility(residentId: string, facilityId: string): Promise<boolean> {
  if (!residentId) return false
  const { data } = await supabase
    .from('Resident')
    .select('id')
    .eq('id', residentId)
    .eq('facilityId', facilityId)
    .maybeSingle()
  return !!data
}

/** 渡された residentId のうち、ログイン中の施設に属するものだけを返す（一括保存用） */
export async function residentIdsInFacility(residentIds: string[], facilityId: string): Promise<Set<string>> {
  const unique = Array.from(new Set(residentIds.filter(Boolean)))
  if (unique.length === 0) return new Set()

  const allowed = new Set<string>()
  const PAGE = 200
  for (let i = 0; i < unique.length; i += PAGE) {
    const { data } = await supabase
      .from('Resident')
      .select('id')
      .in('id', unique.slice(i, i + PAGE))
      .eq('facilityId', facilityId)
    for (const r of data ?? []) allowed.add(r.id)
  }
  return allowed
}
