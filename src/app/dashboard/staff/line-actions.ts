'use server'

import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/session'
import { getBotInfo } from '@/lib/line'
import { encryptSecret } from '@/lib/secrets'
import { revalidatePath } from 'next/cache'

export type LineSettingState = { error?: string; success?: string } | null

/** 画面に返してよい範囲だけ。トークンとシークレットそのものは返さない */
export type LineSettingView = {
  configured: boolean
  botDisplayName: string | null
  botUserId: string | null
  linkedAt: string | null
  hasSecret: boolean
}

export async function getLineSetting(): Promise<LineSettingView> {
  const session = await requireAdmin()
  const { data } = await supabase
    .from('Facility')
    .select('lineChannelAccessToken, lineChannelSecret, lineBotUserId, lineBotDisplayName, lineLinkedAt')
    .eq('id', session.facilityId)
    .maybeSingle()

  return {
    configured: !!data?.lineChannelAccessToken,
    botDisplayName: data?.lineBotDisplayName ?? null,
    botUserId: data?.lineBotUserId ?? null,
    linkedAt: data?.lineLinkedAt ?? null,
    hasSecret: !!data?.lineChannelSecret,
  }
}

/** 施設のLINE公式アカウントを登録する */
export async function saveLineSetting(_prev: LineSettingState, formData: FormData): Promise<LineSettingState> {
  const session = await requireAdmin()

  // コピーしたときに改行や空白が紛れ込むことがある。
  // 混ざったままだと通信の見出しに載せられず、理由の分からない失敗になる
  const accessToken = ((formData.get('accessToken') as string) ?? '').replace(/\s+/g, '')
  const channelSecret = ((formData.get('channelSecret') as string) ?? '').replace(/\s+/g, '')

  if (!accessToken) return { error: 'チャネルアクセストークンを入力してください' }
  if (!channelSecret) return { error: 'チャネルシークレットを入力してください' }
  if (/^\d{10}$/.test(accessToken)) {
    return { error: 'トークンの欄にチャネルIDが入っています。「Messaging API設定」タブの一番下で発行する、長い文字列の方を入れてください' }
  }
  if (/^[0-9a-f]{32}$/i.test(accessToken)) {
    return { error: 'トークンの欄にチャネルシークレットが入っています。「Messaging API設定」タブの一番下で発行する、長い文字列の方を入れてください' }
  }
  if (!/^[0-9a-f]{32}$/i.test(channelSecret)) {
    return { error: 'チャネルシークレットの形式が違います（32文字の英数字）。チャネルIDやトークンと取り違えていないかご確認ください' }
  }

  // 入力されたトークンが本当に使えるかLINEに問い合わせる。
  // あわせて、Webhookで施設を判別するためのアカウントIDを受け取る
  const result = await getBotInfo(accessToken)
  if (!result.ok) {
    return { error: `このトークンではLINEに接続できませんでした。LINEからの返答: ${result.reason}` }
  }
  const info = result.info

  // 別の施設が同じアカウントを登録していないか
  const { data: taken } = await supabase
    .from('Facility').select('id, name')
    .eq('lineBotUserId', info.userId).neq('id', session.facilityId).maybeSingle()
  if (taken) {
    return { error: `この公式アカウントは「${taken.name}」で登録済みです。施設ごとに別のアカウントをご用意ください` }
  }

  const { error } = await supabase
    .from('Facility')
    .update({
      lineChannelAccessToken: encryptSecret(accessToken),
      lineChannelSecret: encryptSecret(channelSecret),
      lineBotUserId: info.userId,
      lineBotDisplayName: info.displayName ?? null,
      lineLinkedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', session.facilityId)

  if (error) return { error: `保存に失敗しました: ${error.message}` }

  revalidatePath('/dashboard/staff')
  revalidatePath('/report')
  revalidatePath('/residents')
  return { success: `「${info.displayName}」を登録しました。ご家族への送信ができるようになります` }
}

/** 登録を解除する。以降その施設からは送信できなくなる */
export async function clearLineSetting(): Promise<LineSettingState> {
  const session = await requireAdmin()

  const { error } = await supabase
    .from('Facility')
    .update({
      lineChannelAccessToken: null,
      lineChannelSecret: null,
      lineBotUserId: null,
      lineBotDisplayName: null,
      lineLinkedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', session.facilityId)

  if (error) return { error: `解除に失敗しました: ${error.message}` }

  revalidatePath('/dashboard/staff')
  revalidatePath('/report')
  return { success: 'LINEの設定を解除しました' }
}
