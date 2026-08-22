import 'server-only'
import crypto from 'crypto'
import { supabase } from './supabase'

// LINE Messaging API の薄いラッパー。
//
// LINE公式アカウントは施設ごとに持つため、トークンとシークレットは
// Facility テーブルから読み、呼び出しごとに渡す。
//
// 重要: プッシュ送信の宛先に使えるのは、ご家族が施設の公式アカウントを
// 友だち追加したときに発行される内部ユーザーID（U + 32桁の16進）だけで、
// 検索用のLINE ID（@から始まる表示上のID）宛には送れない。

const API = 'https://api.line.me/v2/bot'

export type LineChannel = {
  facilityId: string
  accessToken: string
  channelSecret: string | null
}

/** その施設のLINE設定を読む。未設定なら null */
export async function getLineChannel(facilityId: string): Promise<LineChannel | null> {
  const { data } = await supabase
    .from('Facility')
    .select('id, lineChannelAccessToken, lineChannelSecret')
    .eq('id', facilityId)
    .maybeSingle()

  if (!data?.lineChannelAccessToken) return null
  return {
    facilityId: data.id,
    accessToken: data.lineChannelAccessToken,
    channelSecret: data.lineChannelSecret ?? null,
  }
}

/** その施設で送信できる状態か */
export async function isLineConfigured(facilityId: string): Promise<boolean> {
  return (await getLineChannel(facilityId)) !== null
}

/** 内部ユーザーIDの形式か（U + 32桁の16進） */
export function isLineUserId(value: string | null | undefined): boolean {
  return !!value && /^U[0-9a-f]{32}$/.test(value)
}

/** Webhookが本当にLINEから来たものかを検証する */
export function verifyLineSignature(body: string, signature: string | null, channelSecret: string | null): boolean {
  if (!channelSecret || !signature) return false

  const expected = crypto.createHmac('sha256', channelSecret).update(body).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // 長さが違うと timingSafeEqual が例外を投げるため先に確認する
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string }

/** 1人のご家族へメッセージを送る。最大5件までまとめて送れる */
export async function pushMessages(accessToken: string, to: string, messages: LineMessage[]): Promise<void> {
  if (messages.length === 0) return
  if (messages.length > 5) throw new Error('一度に送れるのは5件までです')

  const res = await fetch(`${API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`LINE送信に失敗しました (${res.status}) ${detail.slice(0, 200)}`)
  }
}

export async function pushText(accessToken: string, to: string, text: string): Promise<void> {
  await pushMessages(accessToken, to, [{ type: 'text', text }])
}

/** 公式アカウント自身の情報。トークンが正しいかの確認にも使う */
export async function getBotInfo(accessToken: string): Promise<{ userId: string; displayName: string; basicId: string } | null> {
  try {
    const res = await fetch(`${API}/info`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    return (await res.json()) as { userId: string; displayName: string; basicId: string }
  } catch {
    return null
  }
}

/** Webhookの返信。プッシュ送信の通数を消費しないので、連携時の案内はこちらを使う */
export async function replyText(accessToken: string, replyToken: string, text: string): Promise<void> {
  await fetch(`${API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}
