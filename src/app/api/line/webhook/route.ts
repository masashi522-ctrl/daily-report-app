import { supabase } from '@/lib/supabase'
import { verifyLineSignature, replyText, isLineConfigured } from '@/lib/line'

// ご家族が施設のLINE公式アカウントを友だち追加し、連携コードをトークに送ると
// ここで FamilyContact と内部ユーザーIDが結びつく。
// 以降はこの内部ユーザーID宛に連絡帳と活動写真を送れるようになる。

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
}

const GUIDE = 'ご登録ありがとうございます。\n施設からお伝えした8桁の連携コードを、このトークにそのまま送信してください。'

export async function POST(request: Request) {
  // 署名が検証できない設定でイベントを受け付けると、誰でも連携できてしまう
  if (!isLineConfigured() || !process.env.LINE_CHANNEL_SECRET) {
    return new Response('LINE is not configured', { status: 503 })
  }

  const body = await request.text()
  if (!verifyLineSignature(body, request.headers.get('x-line-signature'))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let events: LineEvent[] = []
  try {
    events = (JSON.parse(body).events ?? []) as LineEvent[]
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  for (const event of events) {
    const userId = event.source?.userId
    if (!userId) continue

    if (event.type === 'follow') {
      if (event.replyToken) await replyText(event.replyToken, GUIDE)
      continue
    }

    if (event.type === 'unfollow') {
      // ブロックされた相手に送り続けないよう連携を外す
      await supabase.from('FamilyContact')
        .update({ lineUserId: null, linkedAt: null, updatedAt: new Date().toISOString() })
        .eq('lineUserId', userId)
      continue
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text ?? '').trim().toUpperCase()
      if (!event.replyToken) continue

      if (!/^[A-Z0-9]{8}$/.test(text)) {
        await replyText(event.replyToken, GUIDE)
        continue
      }

      const { data: link } = await supabase
        .from('FamilyLinkCode').select('*').eq('code', text).maybeSingle()

      if (!link || link.usedAt || new Date(link.expiresAt) < new Date()) {
        await replyText(event.replyToken, '連携コードが確認できませんでした。\nお手数ですが施設までお問い合わせください。')
        continue
      }

      const { data: contact } = await supabase
        .from('FamilyContact').select('*').eq('id', link.familyContactId).maybeSingle()
      if (!contact) {
        await replyText(event.replyToken, '連携コードが確認できませんでした。\nお手数ですが施設までお問い合わせください。')
        continue
      }

      // 同じLINEアカウントが別のご家族に紐づいたままにならないよう先に外す
      await supabase.from('FamilyContact')
        .update({ lineUserId: null, linkedAt: null, updatedAt: new Date().toISOString() })
        .eq('lineUserId', userId).neq('id', contact.id)

      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('FamilyContact')
        .update({ lineUserId: userId, linkedAt: nowIso, updatedAt: nowIso })
        .eq('id', contact.id)

      if (error) {
        await replyText(event.replyToken, '連携に失敗しました。お手数ですが施設までお問い合わせください。')
        continue
      }

      await supabase.from('FamilyLinkCode').update({ usedAt: nowIso }).eq('code', text)
      await replyText(event.replyToken, `${contact.name} 様として連携が完了しました。\nこれから連絡帳と活動のお写真をお届けします。`)
    }
  }

  // LINEは200以外を返すと再送してくるため、処理の成否によらず200を返す
  return new Response('OK', { status: 200 })
}
