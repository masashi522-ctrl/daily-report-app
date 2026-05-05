'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'

export type StaffFormState = { error?: string; success?: string } | null

export async function createStaff(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: '管理者のみアカウントを作成できます' }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const role = formData.get('role') as string || 'STAFF'

  if (!name || !email || !password) return { error: 'すべての項目を入力してください' }
  if (password.length < 6) return { error: 'パスワードは6文字以上にしてください' }

  const hash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()
  const { error } = await supabase.from('Staff').insert({ id: crypto.randomUUID(), name, email, password: hash, role, createdAt: now, updatedAt: now })

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'このメールアドレスはすでに登録されています' }
    }
    return { error: 'アカウントの作成に失敗しました' }
  }

  revalidatePath('/dashboard/staff')
  return { success: `${name} のアカウントを作成しました` }
}

export async function deleteStaff(id: string) {
  const session = await requireSession()
  if (session.role !== 'ADMIN' && session.userId !== id) return
  await supabase.from('Staff').delete().eq('id', id)
  revalidatePath('/dashboard/staff')
}
