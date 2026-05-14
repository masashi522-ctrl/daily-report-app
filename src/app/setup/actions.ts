'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type SetupState = { error: string } | null

export async function setupAdmin(_prevState: SetupState, formData: FormData): Promise<SetupState> {
  const facilityName = (formData.get('facilityName') as string)?.trim()
  const slug         = (formData.get('slug')         as string)?.trim().toLowerCase()
  const name         = (formData.get('name')         as string)?.trim()
  const email        = (formData.get('email')        as string)?.trim()
  const password     = formData.get('password') as string

  if (!facilityName || !slug || !name || !email || !password) return { error: 'すべての項目を入力してください' }
  if (!/^[a-z0-9-]{2,30}$/.test(slug)) return { error: 'URL名は英小文字・数字・ハイフンのみ、2〜30文字で入力してください' }
  if (password.length < 6) return { error: 'パスワードは6文字以上にしてください' }

  const { data: existing } = await supabase.from('Staff').select('id').eq('email', email).maybeSingle()
  if (existing) return { error: 'このメールアドレスはすでに登録されています' }

  const facilityCode = crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
  const facilityId   = crypto.randomUUID()
  const now          = new Date().toISOString()

  const { data: existingSlug } = await supabase.from('Facility').select('id').eq('slug', slug).maybeSingle()
  if (existingSlug) return { error: 'このURL名はすでに使用されています' }

  const { error: facilityError } = await supabase.from('Facility').insert({
    id: facilityId,
    name: facilityName,
    facilityCode,
    slug,
    createdAt: now,
    updatedAt: now,
  })
  if (facilityError) return { error: '施設の作成に失敗しました: ' + facilityError.message }

  const hash = await bcrypt.hash(password, 10)
  const { error } = await supabase.from('Staff').insert({
    id: crypto.randomUUID(),
    name,
    email,
    password: hash,
    role: 'ADMIN',
    facilityId,
    createdAt: now,
    updatedAt: now,
  })
  if (error) return { error: 'アカウントの作成に失敗しました: ' + error.message }

  redirect('/login')
}
