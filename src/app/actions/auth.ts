'use server'

import { supabase } from '@/lib/supabase'
import { createSession, deleteSession } from '@/lib/session'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type LoginState = { error: string } | null

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' }
  }

  const { data: staff } = await supabase
    .from('Staff')
    .select('*')
    .eq('email', email)
    .single()

  if (!staff) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  const isValid = await bcrypt.compare(password, staff.password)
  if (!isValid) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  const { data: facility } = await supabase
    .from('Facility')
    .select('name, slug')
    .eq('id', staff.facilityId)
    .maybeSingle()

  await createSession({
    userId: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    facilityId: staff.facilityId ?? '',
    facilityName: facility?.name ?? '',
    facilitySlug: facility?.slug ?? '',
  })

  redirect(facility?.slug ? `/${facility.slug}` : '/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
