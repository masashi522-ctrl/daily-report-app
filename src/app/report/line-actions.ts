'use server'

import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { residentIdsInFacility } from '@/lib/facility-guard'
import { isLineConfigured, isLineUserId, pushMessages } from '@/lib/line'
import { buildDailyReportImage } from '@/lib/daily-report-image'
import { generateAIText, createGroqClient } from '@/lib/daily-report-ai'
import type { Resident, DailyRecord, FamilyContact } from '@/types/database'

// 生成した連絡帳の画像は、写真と同じ非公開バケットの line/ 配下に置き、
// 署名付きURLをLINEに渡す。LINEは画像をURLで取りに来るため、
// 一定時間アクセスできる場所に置く必要がある。
const BUCKET = 'resident-monthly-photos'
const IMAGE_TTL_SEC = 60 * 60 * 24 * 7

export type SendResult = {
  residentId: string
  residentName: string
  sent: number
  skipped: string | null
  errors: string[]
}

function jstToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

/**
 * 送信対象かどうかを判定する。
 * 「有効化」がオンで、かつ各共有のチェックがオンのものだけを送る。
 */
function shouldSend(resident: Resident) {
  const enabled = resident.familyContactEnabled === true
  return {
    report: enabled && resident.shareDailyReport === true,
    photo: enabled && resident.shareActivityPhoto === true,
    enabled,
  }
}

async function uploadReportImage(
  facilityId: string, residentId: string, date: string, png: Buffer,
): Promise<{ path: string; url: string }> {
  const objectPath = `line/${facilityId}/${residentId}/${date}-${crypto.randomUUID()}.png`
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, png, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`画像の保存に失敗しました: ${error.message}`)

  const { data, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, IMAGE_TTL_SEC)
  if (signErr || !data?.signedUrl) throw new Error('画像のURL発行に失敗しました')
  // path は送信履歴に残し、あとから家族連絡の画面で見られるようにする
  return { path: objectPath, url: data.signedUrl }
}

async function log(
  facilityId: string, residentId: string, familyContactId: string,
  date: string, kind: 'REPORT' | 'PHOTO', status: 'SENT' | 'FAILED', error: string | null,
  imagePaths: { report?: string | null; photos?: string[] } | null = null,
) {
  const base = {
    id: crypto.randomUUID(), facilityId, residentId, familyContactId,
    date, kind, status, error, sentAt: new Date().toISOString(),
  }

  const { error: insErr } = await supabase.from('FamilyMessageLog').insert({ ...base, imagePaths })
  if (!insErr) return

  // imagePaths 列を追加する前でも履歴だけは残す
  console.error('[family-line] 履歴の保存に失敗、imagePaths なしで再試行:', insErr.message)
  await supabase.from('FamilyMessageLog').insert(base)
}

/** 指定した利用者のご家族へ、連絡帳と活動写真をLINEで送る */
export async function sendFamilyLine(residentIds: string[], date?: string): Promise<{ results: SendResult[]; error?: string }> {
  const session = await requireSession()

  if (!isLineConfigured()) {
    return { results: [], error: 'LINEの設定（LINE_CHANNEL_ACCESS_TOKEN）がまだ登録されていません' }
  }

  const targetDate = date || jstToday()
  const allowed = await residentIdsInFacility(residentIds, session.facilityId)
  const ids = residentIds.filter(id => allowed.has(id))
  if (ids.length === 0) return { results: [], error: '対象の利用者がいません' }

  const [{ data: facility }, { data: residentRows }, { data: recordRows }, { data: contactRows }] = await Promise.all([
    supabase.from('Facility').select('name').eq('id', session.facilityId).maybeSingle(),
    supabase.from('Resident').select('*').in('id', ids),
    supabase.from('DailyRecord').select('*').in('residentId', ids).eq('date', targetDate),
    supabase.from('FamilyContact').select('*').in('residentId', ids).eq('isActive', true),
  ])

  const facilityName = facility?.name ?? ''
  const residents = (residentRows ?? []) as Resident[]
  const recordMap = new Map<string, DailyRecord>()
  for (const r of (recordRows ?? []) as DailyRecord[]) recordMap.set(r.residentId, r)

  const contactsByResident = new Map<string, FamilyContact[]>()
  for (const c of (contactRows ?? []) as FamilyContact[]) {
    if (!contactsByResident.has(c.residentId)) contactsByResident.set(c.residentId, [])
    contactsByResident.get(c.residentId)!.push(c)
  }

  const groq = await createGroqClient()
  const [year, month] = targetDate.split('-').map(Number)
  const results: SendResult[] = []

  for (const resident of residents) {
    const result: SendResult = { residentId: resident.id, residentName: resident.name, sent: 0, skipped: null, errors: [] }
    const want = shouldSend(resident)

    if (!want.enabled) { result.skipped = 'ご家族連絡が有効になっていません'; results.push(result); continue }
    if (!want.report && !want.photo) { result.skipped = '連絡帳・活動写真のどちらも共有対象になっていません'; results.push(result); continue }

    // 実際に送れるのは、LINEの友だち追加が済んで内部IDが紐づいた方だけ
    const contacts = (contactsByResident.get(resident.id) ?? []).filter(c => isLineUserId(c.lineUserId))
    if (contacts.length === 0) { result.skipped = 'LINE連携済みのご家族が登録されていません'; results.push(result); continue }

    const record = recordMap.get(resident.id) ?? null

    // ── 連絡帳の画像 ──
    let reportUrl: string | null = null
    let reportPath: string | null = null
    if (want.report) {
      try {
        let ai = { daily: '', rehab: '' }
        if (groq && record) {
          try {
            ai = await generateAIText(groq.client, groq.model, resident, record, targetDate)
          } catch (err) {
            console.error('[family-line] AI生成に失敗', resident.name, err)
          }
        }
        const png = buildDailyReportImage(resident, record, targetDate, facilityName, ai.daily, ai.rehab)
        const uploaded = await uploadReportImage(session.facilityId, resident.id, targetDate, png)
        reportUrl = uploaded.url
        reportPath = uploaded.path
      } catch (err) {
        result.errors.push(`連絡帳の作成に失敗: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ── 活動写真（当月の登録分） ──
    const photoUrls: string[] = []
    const photoPaths: string[] = []
    if (want.photo) {
      const { data: photos } = await supabase
        .from('ResidentMonthlyPhoto')
        .select('storagePath')
        .eq('residentId', resident.id)
        .eq('year', year).eq('month', month)
        .order('sortOrder', { ascending: true })

      for (const p of photos ?? []) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.storagePath, IMAGE_TTL_SEC)
        if (data?.signedUrl) { photoUrls.push(data.signedUrl); photoPaths.push(p.storagePath) }
      }
    }

    if (!reportUrl && photoUrls.length === 0) {
      if (result.errors.length === 0) result.skipped = '送る内容がありませんでした'
      results.push(result)
      continue
    }

    // LINEは1回に5件まで。連絡帳を先に、残り枠で写真を送る
    const messages: { type: 'image'; originalContentUrl: string; previewImageUrl: string }[] = []
    if (reportUrl) messages.push({ type: 'image', originalContentUrl: reportUrl, previewImageUrl: reportUrl })
    for (const url of photoUrls.slice(0, 5 - messages.length)) {
      messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
    }

    // 送った枚数だけを履歴に残す（5件の上限で送れなかった写真は含めない）
    const sentPhotoPaths = photoPaths.slice(0, messages.length - (reportUrl ? 1 : 0))
    const paths = { report: reportPath, photos: sentPhotoPaths }

    for (const contact of contacts) {
      try {
        await pushMessages(contact.lineUserId!, messages)
        result.sent++
        if (reportUrl) await log(session.facilityId, resident.id, contact.id, targetDate, 'REPORT', 'SENT', null, paths)
        if (sentPhotoPaths.length > 0) await log(session.facilityId, resident.id, contact.id, targetDate, 'PHOTO', 'SENT', null, paths)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(`${contact.name}: ${msg}`)
        await log(session.facilityId, resident.id, contact.id, targetDate, reportUrl ? 'REPORT' : 'PHOTO', 'FAILED', msg, paths)
      }
    }

    results.push(result)
  }

  return { results }
}

/** 送信ボタンを出してよいか（LINEの設定が済んでいるか） */
export async function lineReady(): Promise<boolean> {
  await requireSession()
  return isLineConfigured()
}
