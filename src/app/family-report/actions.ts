'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { isResidentInFacility } from '@/lib/facility-guard'
import type { FamilyMessageLog } from '@/types/database'

const BUCKET = 'resident-monthly-photos'
const VIEW_TTL_SEC = 60 * 30

export type SentDetail = {
  residentName: string
  date: string
  /** 宛先ごとの結果 */
  recipients: { name: string; relationship: string | null; kinds: string[]; status: string; error: string | null; sentAt: string }[]
  reportUrl: string | null
  photoUrls: string[]
  /** 画像が消えていて表示できないとき */
  imageMissing: boolean
}

/** 家族連絡の画面で、ある利用者のある日の送信内容を取り出す */
export async function getSentDetail(residentId: string, date: string): Promise<{ detail?: SentDetail; error?: string }> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { error: 'この利用者は表示できません' }
  }

  const [{ data: resident }, { data: logs }] = await Promise.all([
    supabase.from('Resident').select('name').eq('id', residentId).maybeSingle(),
    supabase.from('FamilyMessageLog').select('*')
      .eq('residentId', residentId).eq('date', date).eq('facilityId', session.facilityId)
      .order('sentAt', { ascending: true }),
  ])

  const rows = (logs ?? []) as FamilyMessageLog[]
  if (rows.length === 0) return { error: 'この日の送信記録はありません' }

  // 宛先の氏名を引く
  const contactIds = Array.from(new Set(rows.map(r => r.familyContactId)))
  const { data: contacts } = await supabase
    .from('FamilyContact').select('id, name, relationship').in('id', contactIds)
  const contactMap = new Map((contacts ?? []).map(c => [c.id, c]))

  // 同じ宛先の REPORT / PHOTO をまとめる
  const byContact = new Map<string, FamilyMessageLog[]>()
  for (const r of rows) {
    if (!byContact.has(r.familyContactId)) byContact.set(r.familyContactId, [])
    byContact.get(r.familyContactId)!.push(r)
  }

  const recipients = Array.from(byContact.entries()).map(([id, list]) => {
    const c = contactMap.get(id)
    const failed = list.find(l => l.status === 'FAILED')
    return {
      name: c?.name ?? '（削除された連絡先）',
      relationship: c?.relationship ?? null,
      kinds: list.map(l => (l.kind === 'REPORT' ? '連絡帳' : '活動写真')),
      status: failed ? 'FAILED' : 'SENT',
      error: failed?.error ?? null,
      sentAt: list[0].sentAt,
    }
  })

  // 画像は保存先から署名付きURLを作り直す
  const paths = rows.find(r => r.imagePaths)?.imagePaths ?? null
  let reportUrl: string | null = null
  const photoUrls: string[] = []
  let imageMissing = false

  if (paths?.report) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(paths.report, VIEW_TTL_SEC)
    if (data?.signedUrl) reportUrl = data.signedUrl
    else imageMissing = true
  }
  for (const p of paths?.photos ?? []) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p, VIEW_TTL_SEC)
    if (data?.signedUrl) photoUrls.push(data.signedUrl)
    else imageMissing = true
  }
  // 画像の保存先を記録する前に送った分は、内容を復元できない
  if (!paths) imageMissing = true

  return {
    detail: {
      residentName: resident?.name ?? '',
      date,
      recipients,
      reportUrl,
      photoUrls,
      imageMissing,
    },
  }
}
