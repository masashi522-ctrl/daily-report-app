'use server'

import Groq from 'groq-sdk'
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
  weightAvg: number | null
  weightMin: number | null
  weightMax: number | null
  weightMeasureCount: number
}

export async function generateCareReport(stats: ReportStats): Promise<string> {
  await requireSession()

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return '【設定エラー】GROQ_API_KEY が環境変数に設定されていません。Vercel の環境変数を確認してください。'
  }

  const bp = stats.bpSystolicAvg != null && stats.bpDiastolicAvg != null
    ? `${stats.bpSystolicAvg}/${stats.bpDiastolicAvg} mmHg`
    : 'データなし'

  const weightInfo = stats.weightMeasureCount > 0 && stats.weightAvg != null
    ? stats.weightMax === stats.weightMin
      ? `${stats.weightAvg} kg（${stats.weightMeasureCount}回測定）`
      : `${stats.weightMin}〜${stats.weightMax} kg（月平均 ${stats.weightAvg} kg、${stats.weightMeasureCount}回測定）`
    : 'データなし'

  const systemMessage = `あなたはデイサービスの担当職員として、ケアマネジャーに今月の利用状況を報告する月次サービス報告書を作成します。
以下のルールを必ず守ってください：
・文体は「です・ます」調。丁寧さは保ちながらも、硬すぎず読みやすい自然な文章にすること
・「問題ありません」「特に問題なく」など抽象的な表現は避け、具体的な状態・傾向を伝えること
・数値をただ列挙するのではなく、今月の様子・変化・傾向を読み取って文章化すること
・ケアマネジャーが利用者の状態を把握できるよう、必要な情報を分かりやすく伝えること
・「指摘」や「指示」の口調にならないよう注意し、あくまで「報告」の文章にすること
・「食事量が少ない」「体重が減少」「活動が困難」などのネガティブな表現は、できるかぎりポジティブな表現に言い換えること（例：「少しずつ召し上がっていただいております」「体重の変化に注意しながら経過を見守っております」「サポートしながら楽しんで取り組まれています」など）
・ただしポジティブな言い換えが不自然になる場合は、柔らかく中立的な表現にとどめること`

  const prompt = `以下のデータをもとに、${stats.residentName}さんの${stats.year}年${stats.month}月の月次サービス利用報告書を作成してください。
報告書の冒頭（【今月の概況】の最初）は「${stats.residentName}様の今月のご利用状況についてご報告いたします。」という一文から始めてください。

■ 利用状況
利用日数: ${stats.attendanceCount}日、欠席: ${stats.absentCount}日

■ バイタルサイン（月平均）
血圧: ${bp}
脈拍: ${stats.pulseAvg != null ? `${stats.pulseAvg} 回/分` : 'データなし'}
体温: ${stats.tempAvg != null ? `${stats.tempAvg} ℃` : 'データなし'}

■ 体重
${weightInfo}

■ 食事摂取量（月平均）
主食: ${stats.mealMainAvg != null ? `${Math.round(stats.mealMainAvg * 10)}割` : 'データなし'}
副食: ${stats.mealSideAvg != null ? `${Math.round(stats.mealSideAvg * 10)}割` : 'データなし'}

■ 水分摂取量（月平均）
1日あたり: ${stats.fluidAvg != null ? `${stats.fluidAvg} ml` : 'データなし'}

■ ケアサービス実施状況
入浴: ${stats.bathingCount}回（利用${stats.attendanceForBathing}日中）
機能訓練: ${stats.trainingCount}回
口腔ケア: ${stats.oralCareCount}回

---
上記のデータをもとに、以下の見出しに沿って月次報告書を作成してください。
各見出しの内容は箇条書きを使わず、2〜4文程度の文章（段落）で書いてください。

【今月の概況】
【バイタル・健康状態】
【食事・水分の様子】
【ケアサービス・活動の様子】
【気になる点・お伝えしたいこと】`

  try {
    const client = new Groq({ apiKey })
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
    })
    return completion.choices[0]?.message?.content ?? 'レポートの生成に失敗しました。'
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[generateCareReport] Groq API error:', detail)
    return `【APIエラー】${detail}`
  }
}
