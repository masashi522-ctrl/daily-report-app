'use server'

import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/session'
import { getBotInfo } from '@/lib/line'
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

  const accessToken = (formData.get('accessToken') as string)?.trim()
  const channelSecret = (formData.get('channelSecret') as string)?.trim()

  if (!accessToken) return { error: 'チャネルアクセストークンを入力してください' }
  if (!channelSecret) return { error: 'チャネルシークレットを入力してください' }
  if (!/^[0-9a-f]{32}$/i.test(channelSecret)) {
    return { error: 'チャネルシークレットの形式が違います（32文字の英数字）。チャネルIDやトークンと取り違えていないかご確認ください' }
  }

  // 入力されたトークンが本当に使えるかLINEに問い合わせる。
  // あわせて、Webhookで施設を判別するためのアカウントIDを受け取る
  const info = await getBotInfo(accessToken)
  if (!info?.userId) {
    return { error: 'このトークンではLINEに接続できませんでした。値が正しいか、有効期限が切れていないかご確認ください' }
  }

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
      lineChannelAccessToken: accessToken,
      lineChannelSecret: channelSecret,
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
