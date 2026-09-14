'use server'

import { supabase } from '@/lib/supabase'
import { createSession, deleteSession } from '@/lib/session'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type LoginState = { error: string } | null

// 連続して間違えるとロックする。総当たりを非現実的な速度まで落とすための、
// 最小限の防御（施設・IP単位ではなく、メールアドレス単位）
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

async function authenticate(email: string, password: string, expectedSlug: string | null): Promise<LoginState> {
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

  if (staff.lockedUntil && new Date(staff.lockedUntil) > new Date()) {
    return { error: 'ログイン試行の回数が多いため、しばらく時間をおいてから再度お試しください' }
  }

  const isValid = await bcrypt.compare(password, staff.password)
  if (!isValid) {
    const attempts = (staff.failedLoginAttempts ?? 0) + 1
    const lockedOut = attempts >= MAX_FAILED_ATTEMPTS
    await supabase
      .from('Staff')
      .update({
        failedLoginAttempts: lockedOut ? 0 : attempts,
        lockedUntil: lockedOut ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null,
      })
      .eq('id', staff.id)

    if (lockedOut) {
      return { error: 'ログイン試行の回数が多いため、しばらく時間をおいてから再度お試しください' }
    }
    return { error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  if (staff.failedLoginAttempts || staff.lockedUntil) {
    await supabase.from('Staff').update({ failedLoginAttempts: 0, lockedUntil: null }).eq('id', staff.id)
  }

  const { data: facility } = await supabase
    .from('Facility')
    .select('name, slug')
    .eq('id', staff.facilityId)
    .maybeSingle()

  if (expectedSlug && facility?.slug !== expectedSlug) {
    return { error: 'このURLはご自身の施設用ではありません。ご自身の施設のログインURLからログインしてください' }
  }

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

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  return authenticate(formData.get('email') as string, formData.get('password') as string, null)
}

export async function facilityLogin(slug: string, _prevState: LoginState, formData: FormData): Promise<LoginState> {
  return authenticate(formData.get('email') as string, formData.get('password') as string, slug)
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
