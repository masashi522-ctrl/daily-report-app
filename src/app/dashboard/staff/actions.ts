'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'
import { requireSession, requireAdmin } from '@/lib/session'

export type StaffFormState = { error?: string; success?: string } | null

export async function createStaff(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: '管理者のみアカウントを作成できます' }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const role = formData.get('role') as string || 'STAFF'

  if (!name || !email || !password) return { error: 'すべての項目を入力してください' }
  if (password.length < 10) return { error: 'パスワードは10文字以上にしてください' }

  const hash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()
  const { error } = await supabase.from('Staff').insert({ id: crypto.randomUUID(), name, email, password: hash, role, facilityId: session.facilityId, createdAt: now, updatedAt: now })

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'このメールアドレスはすでに登録されています' }
    }
    return { error: 'アカウントの作成に失敗しました' }
  }

  revalidatePath('/dashboard/staff')
  return { success: `${name} のアカウントを作成しました` }
}

export async function updateStaff(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireSession()
  const id = formData.get('id') as string
  if (!id) return { error: '不正なリクエストです' }
  if (session.role !== 'ADMIN' && session.userId !== id) return { error: '権限がありません' }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!name || !email) return { error: '名前とメールアドレスは必須です' }

  const updates: Record<string, unknown> = { name, email, updatedAt: new Date().toISOString() }

  if (session.role === 'ADMIN') {
    const role = formData.get('role') as string
    if (role) updates.role = role
  }

  if (password) {
    if (password.length < 10) return { error: 'パスワードは10文字以上にしてください' }
    updates.password = await bcrypt.hash(password, 10)
  }

  // 他施設の職員を id 指定で書き換えられないよう、自施設に限定する
  const { data: updated, error } = await supabase
    .from('Staff').update(updates).eq('id', id).eq('facilityId', session.facilityId).select('id')
  if (!error && (updated?.length ?? 0) === 0) return { error: 'この職員は操作できません' }
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'このメールアドレスはすでに登録されています' }
    }
    return { error: '更新に失敗しました' }
  }

  revalidatePath('/dashboard/staff')
  return { success: `${name} の情報を更新しました` }
}

export async function deleteStaff(id: string) {
  const session = await requireSession()
  if (session.role !== 'ADMIN' && session.userId !== id) return
  // 他施設の職員を id 指定で削除できないよう、自施設に限定する
  await supabase.from('Staff').delete().eq('id', id).eq('facilityId', session.facilityId)
  revalidatePath('/dashboard/staff')
}


// 紛らわしい文字（0とO、1とlとI）を除いた、口頭でも伝えられる一時パスワード
function makeTempPassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (set: string, n: number) =>
    Array.from(crypto.randomBytes(n), b => set[b % set.length]).join('')
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 4)}`
}

/**
 * 一時パスワードを発行する。管理者が、パスワードを忘れた職員に渡すためのもの。
 * 発行した値はこのときだけ返し、保存はハッシュのみ。
 */
export async function issueTempPassword(
  staffId: string,
): Promise<{ password?: string; name?: string; error?: string }> {
  const session = await requireAdmin()

  const { data: staff } = await supabase
    .from('Staff').select('id, name')
    .eq('id', staffId).eq('facilityId', session.facilityId).maybeSingle()
  if (!staff) return { error: 'この職員は操作できません' }

  const password = makeTempPassword()
  const { error } = await supabase
    .from('Staff')
    .update({ password: await bcrypt.hash(password, 10), updatedAt: new Date().toISOString() })
    .eq('id', staffId)
    .eq('facilityId', session.facilityId)

  if (error) return { error: `発行に失敗しました: ${error.message}` }

  revalidatePath('/dashboard/staff')
  return { password, name: staff.name }
}
