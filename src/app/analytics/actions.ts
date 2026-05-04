'use server'

import Anthropic from '@anthropic-ai/sdk'
import { requireSession } from '@/lib/session'

export interface ReportStats {
  residentName: string
  year: number
  month: number
  attendanceCount: number
  absentCount: number
  bpSystolicAvg: number | null
  bpDiastolicAvg: number | null
  pulseAvg: number | null
  tempAvg: number | null
  fluidAvg: number | null
  mealMainAvg: number | null
  mealSideAvg: number | null
  bathingCount: number
  attendanceForBathing: number
  trainingCount: number
  oralCareCount: number
}

export async function generateCareReport(stats: ReportStats): Promise<string> {
  await requireSession()

  const client = new Anthropic()

  const bp = stats.bpSystolicAvg != null && stats.bpDiastolicAvg != null
    ? `${stats.bpSystolicAvg}/${stats.bpDiastolicAvg} mmHg`
    : 'データなし'

  const prompt = `あなたはデイサービスのケアマネジャー向けに月次サービス報告書を作成する専門家です。
以下の実績データをもとに、ケアマネジャーに提出する月次報告書を日本語で作成してください。

【対象利用者】${stats.residentName}
【集計期間】${stats.year}年${stats.month}月

■ 出欠状況
利用日数: ${stats.attendanceCount}日、欠席: ${stats.absentCount}日

■ バイタルサイン月平均
血圧: ${bp}
脈拍: ${stats.pulseAvg != null ? stats.pulseAvg + ' 回/分' : 'データなし'}
体温: ${stats.tempAvg != null ? stats.tempAvg + ' ℃' : 'データなし'}
水分摂取量: ${stats.fluidAvg != null ? stats.fluidAvg + ' ml/日' : 'データなし'}

■ 食事量月平均
主食: ${stats.mealMainAvg != null ? Math.round(stats.mealMainAvg * 10) + '%' : 'データなし'}
主菜: ${stats.mealSideAvg != null ? Math.round(stats.mealSideAvg * 10) + '%' : 'データなし'}

■ ケア実施状況
入浴: ${stats.bathingCount}回（利用${stats.attendanceForBathing}日中）
機能訓練: ${stats.trainingCount}回
口腔ケア: ${stats.oralCareCount}回

以下の構成で月次報告書を作成してください。箇条書きは使わず、文章形式で記述してください：

【総括】
【バイタルサインの状況と動向】
【食事・水分摂取の状況】
【ケアサービスの実施状況】
【申し送り事項・今後の対応】`

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : 'レポートの生成に失敗しました。'
}
