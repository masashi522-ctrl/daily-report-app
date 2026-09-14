import 'server-only'
import { supabase } from './supabase'

// 「誰が・いつ・どの記録を書き換えたか」を残す軽量な操作ログ。
// 値そのものの前後比較は持たない（ケアプランはCarePlanHistoryが別途担う）。

export type AuditAction = 'create' | 'update' | 'delete'

export async function logAudit(params: {
  facilityId: string
  staffId: string
  staffName: string
  action: AuditAction
  targetType: string
  targetId: string
  summary?: string
}): Promise<void> {
  try {
    await supabase.from('AuditLog').insert({
      id: crypto.randomUUID(),
      facilityId: params.facilityId,
      staffId: params.staffId,
      staffName: params.staffName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      summary: params.summary ?? null,
      createdAt: new Date().toISOString(),
    })
  } catch {
    // 監査ログの書き込みに失敗しても、本来の操作は止めない
  }
}
