'use server'

import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { isResidentInFacility } from '@/lib/facility-guard'
import { generateCareReportResult } from '@/lib/care-report'
import { loadReportStats } from '@/lib/care-report-stats'

export interface SavedCareReport {
  body: string
  model: string | null
  generatedAt: string
}

/** 生成済みの報告書を1件読む */
export async function getSavedReport(residentId: string, year: number, month: number): Promise<SavedCareReport | null> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) return null

  const { data } = await supabase
    .from('CareReport')
    .select('body, model, generatedAt')
    .eq('residentId', residentId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  return data ?? null
}

/** その月に報告書ができている利用者のIDを返す（まとめて生成の進捗表示用） */
export async function listSavedReportIds(year: number, month: number): Promise<string[]> {
  const session = await requireSession()

  const { data: residents } = await supabase
    .from('Resident').select('id').eq('facilityId', session.facilityId)
  const ids = (residents ?? []).map(r => r.id)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('CareReport')
    .select('residentId')
    .eq('year', year)
    .eq('month', month)
    .in('residentId', ids)
  return (data ?? []).map(r => r.residentId)
}

export type GenerateResult =
  | { status: 'ok'; body: string; model: string }
  // 1分あたりの上限に当たった。seconds 秒待てば続けられる
  | { status: 'wait'; seconds: number }
  // 1日あたりの上限に当たった。当日中は待っても作れないので、まとめて作成は止める
  | { status: 'limit'; message: string; seconds: number }
  // その月の記録がまだ無い。失敗ではないので、まとめて作成では飛ばす
  | { status: 'skip'; message: string }
  | { status: 'error'; message: string }

/**
 * 1人分の報告書を作って保存する。
 * model を渡すとそのモデルだけで生成する（まとめて生成するとき、利用者ごとに文体が変わらないよう揃えるため）。
 */
export async function generateAndSaveReport(
  residentId: string,
  year: number,
  month: number,
  forceDetailed: boolean = false,
  model?: string,
): Promise<GenerateResult> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { status: 'error', message: 'この利用者の報告書は作成できません' }
  }

  const stats = await loadReportStats(residentId, year, month)
  if (!stats) return { status: 'error', message: '利用者が見つかりませんでした' }
  if (stats.attendanceCount === 0 && stats.absentCount === 0) {
    return { status: 'skip', message: `${year}年${month}月の記録がありません` }
  }

  const result = await generateCareReportResult(stats, forceDetailed, model ? { model } : {})
  if (!result.ok) {
    if (result.daily) {
      return { status: 'limit', message: result.message, seconds: result.retryAfterSec ?? 0 }
    }
    if (result.retryAfterSec != null) return { status: 'wait', seconds: result.retryAfterSec }
    return { status: 'error', message: result.message }
  }

  const { error } = await supabase
    .from('CareReport')
    .upsert({
      residentId,
      year,
      month,
      body: result.text,
      model: result.model,
      generatedAt: new Date().toISOString(),
    }, { onConflict: 'residentId,year,month' })
  if (error) {
    console.error('[generateAndSaveReport] 保存に失敗:', error.message)
    // 生成自体は成功しているので、本文は画面に返す
    return { status: 'ok', body: result.text, model: result.model }
  }

  return { status: 'ok', body: result.text, model: result.model }
}

/** 画面で手直しした本文を保存し直す */
export async function saveReportBody(residentId: string, year: number, month: number, body: string): Promise<boolean> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) return false

  const { error } = await supabase
    .from('CareReport')
    .upsert({ residentId, year, month, body, generatedAt: new Date().toISOString() }, { onConflict: 'residentId,year,month' })
  return !error
}
