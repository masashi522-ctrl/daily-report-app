import 'server-only'
import crypto from 'crypto'

// LINE Messaging API の薄いラッパー。
//
// 重要: プッシュ送信の宛先に使えるのは、ご家族が施設の公式アカウントを
// 友だち追加したときに発行される内部ユーザーID（U + 32桁の16進）だけで、
// 検索用のLINE ID（@から始まる表示上のID）宛には送れない。

const API = 'https://api.line.me/v2/bot'
const DATA_API = 'https://api-data.line.me/v2/bot'

/** チャネルアクセストークンが設定されているか。未設定なら送信機能は使えない */
export function isLineConfigured(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN
}

function token(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!t) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
  return t
}

/** 内部ユーザーIDの形式か（U + 32桁の16進） */
export function isLineUserId(value: string | null | undefined): boolean {
  return !!value && /^U[0-9a-f]{32}$/.test(value)
}

/** Webhookが本当にLINEから来たものかを検証する */
export function verifyLineSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // 長さが違うと timingSafeEqual が例外を投げるため先に確認する
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string }

/** 1人のご家族へメッセージを送る。最大5件までまとめて送れる */
export async function pushMessages(to: string, messages: LineMessage[]): Promise<void> {
  if (messages.length === 0) return
  if (messages.length > 5) throw new Error('一度に送れるのは5件までです')

  const res = await fetch(`${API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ to, messages }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`LINE送信に失敗しました (${res.status}) ${detail.slice(0, 200)}`)
  }
}

export async function pushText(to: string, text: string): Promise<void> {
  await pushMessages(to, [{ type: 'text', text }])
}

/**
 * 画像を送る。LINEは画像をURLで受け取るため、送信前にどこかへ置く必要がある。
 * ここでは Supabase Storage の署名付きURLを渡す想定。
 */
export async function pushImage(to: string, imageUrl: string, previewUrl = imageUrl): Promise<void> {
  await pushMessages(to, [{ type: 'image', originalContentUrl: imageUrl, previewImageUrl: previewUrl }])
}

/** 友だち追加したご家族の表示名を取得する（照合の補助に使う） */
export async function getLineProfile(userId: string): Promise<{ displayName: string } | null> {
  try {
    const res = await fetch(`${API}/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (!res.ok) return null
    return (await res.json()) as { displayName: string }
  } catch {
    return null
  }
}

/** Webhookの返信。プッシュ送信の通数を消費しないので、連携時の案内はこちらを使う */
export async function replyText(replyToken: string, text: string): Promise<void> {
  await fetch(`${API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

export { DATA_API }
