'use server'
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// 署名鍵はリクエスト時に解決する（ビルド時に環境変数が無くても失敗させないため）。
// 本番で未設定のときに既知の固定値へフォールバックすると、ソースを見た誰でも
// セッションを偽造できてしまうため、フォールバックは開発時のみ許可する。
function getEncodedKey() {
  const secretKey = process.env.SESSION_SECRET
  if (secretKey) return new TextEncoder().encode(secretKey)

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET が設定されていません。環境変数を設定してください。')
  }
  return new TextEncoder().encode('dev-only-insecure-secret')
}

export type SessionPayload = {
  userId: string
  email: string
  name: string
  role: string
  facilityId: string
  facilityName: string
  facilitySlug: string
}

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getEncodedKey())

  const cookieStore = await cookies()
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  if (!cookie) return null

  try {
    const { payload } = await jwtVerify(cookie, getEncodedKey(), { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

// 役割は 'ADMIN' / 'STAFF' の2つ。以前は小文字で比較していたため
// 管理者でも必ず弾かれ、存在しないURLへ飛ばしていた
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') redirect('/dashboard')
  return session
}
