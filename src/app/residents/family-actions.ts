'use server'

import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { isResidentInFacility } from '@/lib/facility-guard'
import { revalidatePath } from 'next/cache'
import type { FamilyContact } from '@/types/database'

export type FamilyActionState = { error?: string; success?: string } | null

/** 連携コードの有効期間 */
const LINK_CODE_DAYS = 30

function now() {
  return new Date().toISOString()
}

/** 紛らわしい文字（0/O、1/I など）を避けた8桁のコード */
function makeLinkCode(): string {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(8)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export async function listFamilyContacts(residentId: string): Promise<FamilyContact[]> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) return []

  const { data } = await supabase
    .from('FamilyContact')
    .select('*')
    .eq('residentId', residentId)
    .order('createdAt', { ascending: true })
  return (data ?? []) as FamilyContact[]
}

export async function addFamilyContact(
  residentId: string,
  _prevState: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { error: 'この利用者は操作できません' }
  }

  const name = (formData.get('name') as string)?.trim()
  const relationship = (formData.get('relationship') as string)?.trim() || null
  const lineId = (formData.get('lineId') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null

  if (!name) return { error: '氏名を入力してください' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('FamilyContact').insert({
    id,
    facilityId: session.facilityId,
    residentId,
    name,
    relationship,
    lineId,
    phone,
    isActive: true,
    lineUserId: null,
    linkedAt: null,
    createdAt: now(),
    updatedAt: now(),
  })
  if (error) return { error: `登録に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  return { success: `${name} を登録しました` }
}

export async function updateFamilyContact(
  contactId: string,
  _prevState: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await requireSession()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: '氏名を入力してください' }

  const { data: updated, error } = await supabase
    .from('FamilyContact')
    .update({
      name,
      relationship: (formData.get('relationship') as string)?.trim() || null,
      lineId: (formData.get('lineId') as string)?.trim() || null,
      phone: (formData.get('phone') as string)?.trim() || null,
      updatedAt: now(),
    })
    .eq('id', contactId)
    .eq('facilityId', session.facilityId)
    .select('id')

  if (error) return { error: `更新に失敗しました: ${error.message}` }
  if ((updated?.length ?? 0) === 0) return { error: 'この連絡先は操作できません' }

  revalidatePath('/residents')
  return { success: `${name} の情報を更新しました` }
}

export async function deleteFamilyContact(contactId: string): Promise<FamilyActionState> {
  const session = await requireSession()

  const { error } = await supabase
    .from('FamilyContact')
    .delete()
    .eq('id', contactId)
    .eq('facilityId', session.facilityId)

  if (error) return { error: `削除に失敗しました: ${error.message}` }

  // 使い終わった連携コードも残さない
  await supabase.from('FamilyLinkCode').delete().eq('familyContactId', contactId)

  revalidatePath('/residents')
  return { success: '連絡先を削除しました' }
}

/** LINEの友だち追加を、このご家族に紐づけるための連携コードを発行する */
export async function issueLinkCode(contactId: string): Promise<{ code?: string; error?: string }> {
  const session = await requireSession()

  const { data: contact } = await supabase
    .from('FamilyContact')
    .select('id, name')
    .eq('id', contactId)
    .eq('facilityId', session.facilityId)
    .maybeSingle()
  if (!contact) return { error: 'この連絡先は操作できません' }

  // 未使用のコードは作り直さず、1件だけ有効なものを保つ
  await supabase.from('FamilyLinkCode').delete().eq('familyContactId', contactId).is('usedAt', null)

  const code = makeLinkCode()
  const expiresAt = new Date(Date.now() + LINK_CODE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('FamilyLinkCode').insert({
    code, familyContactId: contactId, facilityId: session.facilityId, expiresAt, usedAt: null, createdAt: now(),
  })
  if (error) return { error: `発行に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  return { code }
}

/** LINEの連携を解除する（機種変更や誤連携のとき） */
export async function unlinkFamilyContact(contactId: string): Promise<FamilyActionState> {
  const session = await requireSession()

  const { data: updated, error } = await supabase
    .from('FamilyContact')
    .update({ lineUserId: null, linkedAt: null, updatedAt: now() })
    .eq('id', contactId)
    .eq('facilityId', session.facilityId)
    .select('id')

  if (error) return { error: `解除に失敗しました: ${error.message}` }
  if ((updated?.length ?? 0) === 0) return { error: 'この連絡先は操作できません' }

  revalidatePath('/residents')
  return { success: 'LINEの連携を解除しました' }
}

/** 利用者側の共有設定（有効化・連絡帳・活動写真） */
export async function updateShareSettings(
  residentId: string,
  settings: { familyContactEnabled: boolean; shareDailyReport: boolean; shareActivityPhoto: boolean },
): Promise<FamilyActionState> {
  const session = await requireSession()
  if (!(await isResidentInFacility(residentId, session.facilityId))) {
    return { error: 'この利用者は操作できません' }
  }

  const { error } = await supabase
    .from('Resident')
    .update({
      familyContactEnabled: settings.familyContactEnabled,
      shareDailyReport: settings.shareDailyReport,
      shareActivityPhoto: settings.shareActivityPhoto,
      updatedAt: now(),
    })
    .eq('id', residentId)
    .eq('facilityId', session.facilityId)

  if (error) return { error: `保存に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  revalidatePath('/report')
  return { success: '共有設定を保存しました' }
}
