'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type RegisterState = { error: string } | null

export async function register(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!name || !email || !password) return { error: 'すべての項目を入力してください' }
  if (password.length < 6) return { error: 'パスワードは6文字以上にしてください' }
  if (password !== confirm) return { error: 'パスワードが一致しません' }

  const { data: existing } = await supabase.from('Staff').select('id').eq('email', email).single()
  if (existing) return { error: 'このメールアドレスはすでに登録されています' }

  const hash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()
  const { error } = await supabase.from('Staff').insert({
    id: crypto.randomUUID(),
    name,
    email,
    password: hash,
    role: 'STAFF',
    createdAt: now,
    updatedAt: now,
  })

  if (error) return { error: 'アカウントの作成に失敗しました' }

  redirect('/login')
}
