'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type SetupState = { error: string } | null

export async function setupAdmin(_prevState: SetupState, formData: FormData): Promise<SetupState> {
  const { count } = await supabase.from('Staff').select('*', { count: 'exact', head: true })
  if (count && count > 0) return { error: 'すでにアカウントが存在します' }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!name || !email || !password) return { error: 'すべての項目を入力してください' }
  if (password.length < 6) return { error: 'パスワードは6文字以上にしてください' }

  const hash = await bcrypt.hash(password, 10)
  const { error } = await supabase.from('Staff').insert({
    name,
    email,
    password: hash,
    role: 'ADMIN',
  })

  if (error) return { error: 'アカウントの作成に失敗しました: ' + error.message }

  redirect('/login')
}
