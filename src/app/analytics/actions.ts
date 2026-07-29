'use server'

import Groq from 'groq-sdk'
import { requireSession } from '@/lib/session'

export interface CareNote {
  date: string
  label: string
  text: string
}

export interface CarePlanGoalSummary {
  issue: string
  longTermGoal: string
  shortTermGoal: string
}

export interface CarePlanSummary {
  goalImage: string | null
  goals: CarePlanGoalSummary[]
}

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
  careNotes: CareNote[]
  carePlan: CarePlanSummary | null
}

// Groq/Llamaが稀に混入させる簡体字を、対応する日本語表記に補正する（プロンプト指示だけに頼らない保険）
const SIMPLIFIED_CHINESE_FIXES: [RegExp, string][] = [
  [/状态/g, '状態'],
  [/状况/g, '状況'],
  [/变化/g, '変化'],
  [/观察/g, '観察'],
  [/时间/g, '時間'],
  [/实施/g, '実施'],
  [/继续/g, '継続'],
  [/达到/g, '達成'],
  [/记录/g, '記録'],
  [/检查/g, '検査'],
  [/营养/g, '栄養'],
  [/训练/g, '訓練'],
  [/认知/g, '認知'],
  [/记忆/g, '記憶'],
  [/皮肤/g, '皮膚'],
  [/关心/g, '関心'],
  [/发红/g, '発赤'],
  [/伤口/g, '傷口'],
]

function sanitizeReportText(text: string): string {
  return SIMPLIFIED_CHINESE_FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

export async function generateCareReport(stats: ReportStats, forceDetailed: boolean = false): Promise<string> {
  await requireSession()

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return '【設定エラー】GROQ_API_KEY が環境変数に設定されていません。Vercel の環境変数を確認してください。'
  }

  const bpSys = stats.bpSystolicAvg != null ? Math.round(stats.bpSystolicAvg) : null
  const bpDia = stats.bpDiastolicAvg != null ? Math.round(stats.bpDiastolicAvg) : null
  const bp = bpSys != null && bpDia != null ? `${bpSys}/${bpDia} mmHg` : 'データなし'
  const pulse = stats.pulseAvg != null ? `${Math.round(stats.pulseAvg)} 回/分` : 'データなし'
  const temp = stats.tempAvg != null ? `${stats.tempAvg} ℃` : 'データなし'
  const fluid = stats.fluidAvg != null ? `${Math.round(stats.fluidAvg)} ml` : 'データなし'
  const mealMain = stats.mealMainAvg != null ? `${Math.round(stats.mealMainAvg)}割` : 'データなし'
  const mealSide = stats.mealSideAvg != null ? `${Math.round(stats.mealSideAvg)}割` : 'データなし'

  const weightInfo = stats.weightMeasureCount > 0 && stats.weightAvg != null
    ? stats.weightMax === stats.weightMin
      ? `${stats.weightAvg} kg（${stats.weightMeasureCount}回測定）`
      : `${stats.weightMin}〜${stats.weightMax} kg（月平均 ${stats.weightAvg} kg、${stats.weightMeasureCount}回測定）`
    : 'データなし'

  const systemMessage = `あなたはデイサービスの担当職員として、ケアマネジャーに今月の利用状況を報告する月次サービス報告書を作成します。
以下のルールを必ず守ってください：

【言語ルール・最優先】
・出力は必ず日本語（ひらがな・カタカナ・漢字・数字・句読点）のみで記述すること
・韓国語・中国語・英語など日本語以外の文字を一切混在させないこと
・「본인」「본」などハングル文字は絶対に使用しないこと
・簡体字（中国語の漢字）を絶対に使わないこと。特に次の字は日本語の字体に置き換えること：
　状态→状態／状况→状況／变化→変化／观察→観察／时间→時間／实施→実施／继续→継続／达到→達成／记录→記録／检查→検査／营养→栄養／训练→訓練／认知→認知／记忆→記憶／皮肤→皮膚

【文体・表現のルール】
・文体は「です・ます」調。丁寧さは保ちながらも、硬すぎず読みやすい自然な文章にすること
・利用者の氏名は報告書全体を通じて最初の1回のみ使用し、以降は「ご利用者」で統一すること（「ご本人」は使わないこと）
・「問題ありません」「特に問題なく」など抽象的な表現は避け、具体的な状態・傾向を伝えること
・数値をただ列挙するのではなく、今月の様子・変化・傾向を読み取って文章化すること
・ケアマネジャーが利用者の状態を把握できるよう、必要な情報を分かりやすく伝えること
・「指摘」や「指示」の口調にならないよう注意し、あくまで「報告」の文章にすること
・「食事量が少ない」「体重が減少」「活動が困難」などのネガティブな表現は、できるかぎりポジティブな表現に言い換えること（例：「少しずつ召し上がっていただいております」「体重の変化に注意しながら経過を見守っております」「サポートしながら楽しんで取り組まれています」など）
・ただしポジティブな言い換えが不自然になる場合は、柔らかく中立的な表現にとどめること
・この言い換えルールは、日々の様子に関する一般的な表現にのみ適用すること。皮膚状態の異常・外傷・体調急変など、事実として観察された安全・健康上の所見は、婉曲化・軽視せず、正確にそのまま報告すること（例：「発赤を確認しました」を「少し気になる様子でした」のように弱めないこと）

【使ってはいけない表現・言い換えルール】
・「〜を行いました」→「〜でした」「〜されました」に言い換えること（例：「ご利用を行いました」→「ご利用でした」）
・「〜が行われているようです」「〜のようです」→ 確認できている事実は「〜でした」「〜いただけました」と言い切ること
・「過ごしていただいているようです」→「お過ごしいただきました」に言い換えること
・「〜を行っていただいているようです」のような二重の遠回し表現は使わないこと
・事実として記録されているデータに「〜のようです」「〜と思われます」などの曖昧な推量表現を付けないこと
・「お日柄」は天気・縁起を指す言葉であり、介護報告書では絶対に使わないこと
・「寄与する」「寄与したい」→「お役に立てるよう」「お支えできるよう」「引き続きサポートしてまいります」に言い換えること
・「清潔を保つことができました」→「清潔にお過ごしいただきました」「入浴でさっぱりとお過ごしいただきました」に言い換えること
・「〜することができました」は多用しないこと。「〜いただきました」「〜されました」「〜でした」で言い換えること
・「安らかに過ごすことができました」→「穏やかにお過ごしいただきました」に言い換えること
・介護現場で使わない格式語・文語（「寄与」「お日柄」「享受」「鑑みて」など）は使わないこと
・「〜についてみましたところ」「〜の様子です」など回りくどい導入は使わないこと
・「お休み、いただかれなかった」のような不自然な敬語表現は使わないこと

【出欠の表現ルール】
・欠席0日の場合：「お休みなく、予定利用日はすべてご利用いただけました。」
・欠席がある場合：「○日間ご利用いただき、○日お休みされました。」
・「〜についてみましたところ」「確認しましたところ」などの前置きは不要。出欠の事実を直接書くこと`

  const hasNotable = stats.careNotes.length > 0 || forceDetailed
  const careNotesText = stats.careNotes.length > 0
    ? stats.careNotes.map(n => {
        const d = n.date.split('-')
        return `${parseInt(d[1])}月${parseInt(d[2])}日［${n.label}］${n.text}`
      }).join('\n')
    : 'なし'

  const hasCarePlan = !!stats.carePlan && (
    !!stats.carePlan.goalImage?.trim() || stats.carePlan.goals.some(g => g.issue || g.longTermGoal || g.shortTermGoal)
  )
  const carePlanText = hasCarePlan && stats.carePlan
    ? [
        stats.carePlan.goalImage ? `ゴールのイメージ: ${stats.carePlan.goalImage}` : '',
        ...stats.carePlan.goals
          .filter(g => g.issue || g.longTermGoal || g.shortTermGoal)
          .map((g, i) => `援助目標${i + 1} — 課題: ${g.issue || 'なし'} / 長期目標: ${g.longTermGoal || 'なし'} / 短期目標: ${g.shortTermGoal || 'なし'}`),
      ].filter(Boolean).join('\n')
    : 'なし（介護計画書が未作成、または未保存です）'

  const prompt = `以下のデータをもとに、${stats.residentName}様の${stats.year}年${stats.month}月の月次サービス利用報告書を作成してください。
【今月の概況】の冒頭は「${stats.residentName}様の今月のご利用状況についてご報告いたします。」という一文から始め、以降は氏名を繰り返さないこと。

■ 利用状況
利用日数: ${stats.attendanceCount}日、欠席: ${stats.absentCount}日

■ バイタルサイン（月平均）
血圧: ${bp}
脈拍: ${pulse}
体温: ${temp}

■ 体重（月内測定値）
${weightInfo}

■ 食事摂取量（月平均・10割が全量）
主食: ${mealMain}
副食: ${mealSide}

■ 水分摂取量（月平均）
1日あたり: ${fluid}

■ ケアサービス実施状況（参考値。文章中に回数をすべて列挙する必要はありません）
入浴: ${stats.bathingCount}回（利用${stats.attendanceForBathing}日中）
機能訓練: ${stats.trainingCount}回
口腔ケア: ${stats.oralCareCount}回

■ 現場の記録（特記事項・入浴/機能訓練/口腔ケアの申し送りメモ）
${careNotesText}

■ この利用者の介護計画書（通所介護計画書）の内容
${carePlanText}

---
上記のデータをもとに、以下の見出しに沿って月次報告書を作成してください。
各見出しの内容は箇条書きを使わず、2〜4文程度の文章（段落）で書いてください。
体重データがある場合は【バイタル・健康状態】または【食事・水分の様子】の中で具体的な数値を引用して触れること。

【介護計画書との関連づけ】（重要）:
${hasCarePlan ? `・介護計画書の情報があります。【今月の概況】の最後に、計画の「ゴールのイメージ」に触れながら、今月もその実現に向けて取り組んだことが伝わる一文を加えること（例:「『(ゴールのイメージ)』を目指し、今月も○○に取り組んでいただきました。」のような形）。ゴールのイメージがない場合は援助目標の長期目標で代用すること。
・【ケアサービス・活動の様子】は、介護計画書の援助目標（特に短期目標・サービス内容）と関連づけて、今月の様子がその目標にどうつながっているかが伝わるように書くこと。目標の文言をそのまま引き写すのではなく、実際の様子として自然に言い換えること。` : `・介護計画書の情報がないため、通常通り、データと現場の記録のみをもとに記載すること。介護計画書が未作成である旨には触れないこと。`}

【ケアサービス・活動の様子】の書き方（最重要・必ず守ること）:
・入浴・機能訓練・口腔ケアの実施回数を毎回すべて列挙しないこと。「入浴は○回、機能訓練も○回、口腔ケアは○回実施しました」のように回数を並べる書き方は禁止。回数に触れるとしても、文章の流れの中で最大1つまでにとどめること。
・書く材料が少ないからといって、回数の列挙で文章を長くすることは絶対にしないこと。書く内容が乏しい場合は、無理に長くせず簡潔にまとめること。
${hasNotable ? `・今月はこの利用者について詳しく報告する必要があります（現場の記録がある、または加算対象・ケアプラン更新月に該当）。
　上記「現場の記録」がある場合はその内容をもとに、①デイで実際に観察された具体的な事実（日付・部位・状況など）、②介護職員・機能訓練指導員としての見解（原因の推測や状態の解釈）、③デイでの対応内容、④ご自宅での様子や対応について、ケアマネジャーに確認・共有をお願いする一文、の4つの要素を1つの段落の中に自然な流れで盛り込むこと。④は「ご自宅での○○について、ケアマネジャー様からもご確認いただけますと幸いです。」のように、具体的に何を確認してほしいかが分かる形で必ず含めること。【事実】【評価】のような見出しやラベルは付けず、普通の報告文として書くこと。
　「現場の記録」が「なし」で、加算対象・ケアプラン更新月などの理由のみで詳しい報告が必要な場合は、回数の列挙で分量を稼ぐのではなく、活動への参加の様子や取り組み方、機能訓練での様子など、実際に観察できた具体的な内容を中心に記載すること。特に具体的に書ける内容がなければ、無理に4〜5文にせず、通常の分量（2〜3文）で構わない。` : `・今月はこの利用者について特段の変化がありません。定型的な一文（例:「入浴・機能訓練・口腔ケアを通じて、いつも通り穏やかにお過ごしいただきました。」）に、気づいた点があれば一言添える程度の簡潔な記載（2文程度）にとどめ、長く書きすぎないこと。`}

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
    const raw = completion.choices[0]?.message?.content
    return raw ? sanitizeReportText(raw) : 'レポートの生成に失敗しました。'
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[generateCareReport] Groq API error:', detail)
    return `【APIエラー】${detail}`
  }
}
