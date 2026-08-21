import 'server-only'
import Groq from 'groq-sdk'
import type { Resident, DailyRecord } from '@/types/database'
import { resolveGroqModel, stripReasoning } from '@/lib/groq-model'

export const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

// 連絡帳のExcelとLINEで送る画像の両方で同じ文章を使うため、
// AI生成と表記の決まりごとはここに集約する。

export function bathingLabel(bathing: string, skipReason: string | null): string {
  if (bathing === 'DONE') return '有'
  if (bathing === 'NOT_DONE') return '無（' + (skipReason ?? '理由不明') + '）'
  return '対象外'
}

// 連絡帳はご家族が読むものなので、やわらかく穏やかな文章になるよう指示する
export const TONE_RULES = `
【文体・トーンのルール】
・「です・ます」調で、やわらかく穏やかなトーンで書くこと。事務的で硬い言い切りが続かないようにすること
・「〜が必要です」「〜してください」「〜すべきです」のような強い言い方は使わないこと
・気になる点を伝えるときは、いきなり指摘から入らず、良い面や取り組まれている様子に触れてから「〜という場面もございました」とやわらかく続けること
・「食事量が少ない」「入浴を拒否」などのネガティブな表現は、できるかぎり穏やかな表現に言い換えること（例：「ゆっくりと召し上がっていらっしゃいました」「本日はご希望によりシャワー浴でお過ごしいただきました」）
・ただし、皮膚の異常・外傷・体調急変など、事実として観察された安全・健康上の所見は、やわらげて内容を弱めず、事実を正確に書くこと
・数値をそのまま羅列せず、その日のご様子が伝わる文章にすること

【書いてはいけない内容】
・記録に無いことを書かないこと。会話の内容、表情、レクリエーションの種目など、
　上のデータに書かれていない出来事を推測で作り出すことは禁止です
・「その日の様子（職員の記録）」がある場合は、その内容を中心に文章を組み立てること。
　記載がない場合は、無理に様子を描写せず、記録から言えることだけを簡潔に書くこと
・体温・血圧・脈拍・水分量などの数値を本文に書かないこと（記録欄に別途記載されています）
・服薬の要否や体調の原因についての医療的な判断・助言を書かないこと。
　気になる所見は「〜が見られました」と事実のみを伝えること
・「以下のとおりです」「作成しました」などの前置き・後書きを書かないこと
・指定された文数を守り、それ以上長く書かないこと

【出力形式】
・出力は日本語の文章のみ。見出し・ラベル・箇条書き・かぎかっこでの囲みは付けないこと`

export function sheetSafeName(name: string): string {
  return name.replace(/[:\\/?\[\]]/g, '').slice(0, 31)
}

export async function generateAIText(
  client: Groq,
  model: string,
  resident: Resident,
  record: DailyRecord,
  dateStr: string,
): Promise<{ daily: string; rehab: string }> {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
  const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch
  const bpAm = record.bpSystolic != null ? record.bpSystolic + '/' + record.bpDiastolic : '未測定'
  const bpPm = record.bpSystolicPm != null ? record.bpSystolicPm + '/' + record.bpDiastolicPm : '未測定'
  const trainingTime = record.functionalTrainingStart
    ? record.functionalTrainingStart + '-' + (record.functionalTrainingEnd ?? '')
    : ''
  const context = [
    '利用者名: ' + resident.name,
    resident.careLevel ? '要介護区分: ' + resident.careLevel : '',
    '日付: ' + y + '年' + m + '月' + d + '日（' + DOW_JA[dow] + '曜日）',
    '体温: 午前 ' + (record.tempMorning ?? '未測定') + '℃ / 午後 ' + (record.tempAfternoon ?? '未測定') + '℃',
    '血圧: 午前 ' + bpAm + ' / 午後 ' + bpPm + ' mmHg',
    '脈拍: 午前 ' + (record.pulse ?? '未測定') + ' / 午後 ' + (record.pulsePm ?? '未測定') + ' 回/分',
    '食事: 主食 ' + (record.mealMainFood != null ? record.mealMainFood + '割' : '未記録') + ' 副食 ' + (record.mealSideFood != null ? record.mealSideFood + '割' : '未記録'),
    '水分: 計 ' + totalFluid + 'ml（午前 ' + (record.fluidIntakeAm ?? 0) + 'ml + 午後 ' + (record.fluidIntakePm ?? 0) + 'ml）',
    '入浴: ' + bathingLabel(record.bathing, record.bathingSkipReason),
    '口腔ケア: ' + (record.oralCare ? '実施' : '未実施'),
    '服薬: 朝' + (record.medicationMorning ? '有' : '無') + ' 昼' + (lunchMed ? '有' : '無') + ' 夕' + (record.medicationEvening ? '有' : '無'),
    '機能訓練: ' + (record.trainingDone ? '実施' + (trainingTime ? '（' + trainingTime + '）' : '') : '未実施'),
    record.specialNotes ? '特記事項: ' + record.specialNotes : '',
    record.dailyNote ? 'その日の様子（職員の記録）: ' + record.dailyNote : '',
    resident.specialCondition ? '利用者特記: ' + resident.specialCondition : '',
  ].filter(Boolean).join('\n')

  const [dailyRes, rehabRes] = await Promise.all([
    client.chat.completions.create({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: 'あなたはデイサービスの介護記録担当スタッフです。以下の当日記録をもとに「日中のご様子・連絡事項」欄の文章を自然な介護記録文体で３〜５文で作成してください。文章のみ出力してください。\n' + TONE_RULES + '\n\n' + context }],
    }),
    record.trainingDone
      ? client.chat.completions.create({
          model,
          max_tokens: 800,
          messages: [{ role: 'user', content: 'あなたはデイサービスの機能訓練担当スタッフです。以下の訓練記録をもとに「リハビリからの連絡事項」欄の文章を自然な記録文体で１〜２文で作成してください。文章のみ出力してください。\n' + TONE_RULES + '\n\n' + context }],
        })
      : Promise.resolve(null),
  ])
  return {
    daily: stripReasoning(dailyRes.choices[0]?.message?.content ?? ''),
    rehab: stripReasoning(rehabRes?.choices[0]?.message?.content ?? ''),
  }
}


/** Groqのクライアントと利用可能なモデルを用意する。APIキーが無ければ null */
export async function createGroqClient(): Promise<{ client: Groq; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  const client = new Groq({ apiKey })
  return { client, model: await resolveGroqModel(client) }
}
