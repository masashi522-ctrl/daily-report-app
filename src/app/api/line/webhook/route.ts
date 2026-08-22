import { supabase } from '@/lib/supabase'
import { verifyLineSignature, replyText } from '@/lib/line'

// ご家族が施設のLINE公式アカウントを友だち追加し、連携コードをトークに送ると
// ここで FamilyContact と内部ユーザーIDが結びつく。
// 以降はこの内部ユーザーID宛に連絡帳と活動写真を送れるようになる。
//
// 公式アカウントは施設ごとにあるため、Webhookの宛先（destination）から
// どの施設のアカウント宛かを判別し、その施設のシークレットで署名を検証する。

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
}

const GUIDE = 'ご登録ありがとうございます。\n施設からお伝えした8桁の連携コードを、このトークにそのまま送信してください。'
const NG = '連携コードが確認できませんでした。\nお手数ですが施設までお問い合わせください。'

export async function POST(request: Request) {
  const body = await request.text()

  // destination は署名の検証に使う鍵を選ぶためだけに読む。
  // 検証が通るまで、この内容にもとづく変更は一切行わない。
  let destination = ''
  let events: LineEvent[] = []
  try {
    const parsed = JSON.parse(body)
    destination = String(parsed.destination ?? '')
    events = (parsed.events ?? []) as LineEvent[]
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!destination) return new Response('Missing destination', { status: 400 })

  const { data: facility } = await supabase
    .from('Facility')
    .select('id, lineChannelAccessToken, lineChannelSecret')
    .eq('lineBotUserId', destination)
    .maybeSingle()

  if (!facility?.lineChannelAccessToken || !facility.lineChannelSecret) {
    // 設定が済んでいないアカウント宛。受け付けない
    return new Response('Channel is not configured', { status: 503 })
  }

  if (!verifyLineSignature(body, request.headers.get('x-line-signature'), facility.lineChannelSecret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const token = facility.lineChannelAccessToken

  for (const event of events) {
    const userId = event.source?.userId
    if (!userId) continue

    if (event.type === 'follow') {
      if (event.replyToken) await replyText(token, event.replyToken, GUIDE)
      continue
    }

    if (event.type === 'unfollow') {
      // ブロックされた相手に送り続けないよう連携を外す
      await supabase.from('FamilyContact')
        .update({ lineUserId: null, linkedAt: null, updatedAt: new Date().toISOString() })
        .eq('lineUserId', userId).eq('facilityId', facility.id)
      continue
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text ?? '').trim().toUpperCase()
      if (!event.replyToken) continue

      if (!/^[A-Z0-9]{8}$/.test(text)) {
        await replyText(token, event.replyToken, GUIDE)
        continue
      }

      // 連携コードは、そのアカウントを持つ施設のものだけを受け付ける
      const { data: link } = await supabase
        .from('FamilyLinkCode').select('*')
        .eq('code', text).eq('facilityId', facility.id).maybeSingle()

      if (!link || link.usedAt || new Date(link.expiresAt) < new Date()) {
        await replyText(token, event.replyToken, NG)
        continue
      }

      const { data: contact } = await supabase
        .from('FamilyContact').select('*')
        .eq('id', link.familyContactId).eq('facilityId', facility.id).maybeSingle()
      if (!contact) {
        await replyText(token, event.replyToken, NG)
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
        await replyText(token, event.replyToken, '連携に失敗しました。お手数ですが施設までお問い合わせください。')
        continue
      }

      await supabase.from('FamilyLinkCode').update({ usedAt: nowIso }).eq('code', text)
      await replyText(token, event.replyToken,
        `${contact.name} 様として連携が完了しました。\nこれから連絡帳と活動のお写真をお届けします。`)
    }
  }

  // LINEは200以外を返すと再送してくるため、処理の成否によらず200を返す
  return new Response('OK', { status: 200 })
}
