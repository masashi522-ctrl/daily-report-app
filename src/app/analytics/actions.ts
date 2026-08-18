'use server'

import Groq from 'groq-sdk'
import { requireSession } from '@/lib/session'
import { resolveGroqModels, stripReasoning } from '@/lib/groq-model'

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

export interface ServiceGap {
  date: string
  label: string
  reason: string
}

export interface DailyNote {
  date: string
  text: string
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
  dailyNotes: DailyNote[]
  carePlan: CarePlanSummary | null
  serviceGaps: ServiceGap[]
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

// 単位（mmHg・kg・ml等）以外で、日本語の文字に直接くっついて挿入される英単語や、
// デーヴァナーガリー文字・ハングルなど日本語で使わないスクリプトが稀に混入するための保険
const ALLOWED_LATIN_UNITS = /^(mmHg|kg|g|ml|l|kcal|cm|mm|bpm|dl)$/i
function stripStrayForeignScript(text: string): string {
  const noForeignScript = text.replace(/[ऀ-ॿ가-힣ᄀ-ᇿЀ-ӿ؀-ۿ฀-๿]/g, '')
  return noForeignScript.replace(
    /(?<=[぀-ヿ一-鿿])([A-Za-z]{2,})(?=[぀-ヿ一-鿿])/g,
    (match, word: string) => (ALLOWED_LATIN_UNITS.test(word) ? match : '')
  )
}

function sanitizeReportText(text: string): string {
  const fixed = SIMPLIFIED_CHINESE_FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
  return collapseRepeatedSentences(stripStrayForeignScript(fixed))
}

// Groq/Llamaが稀に文末や短い文を連続で繰り返す（例:「いただけました。いただけました。」）ほか、
// 同じ定型文が離れた見出しにまたがって重複することがあるため、2種類の重複を除去する：
// (1) 直前の文と完全一致する文、または直前の文の語尾と完全一致する短い断片（連続重複）
// (2) 文書全体で見て、ある程度の長さを持つ文が2回以上出現する場合の2回目以降（離れた場所の重複）
function collapseRepeatedSentences(text: string): string {
  const parts = text.split(/(?<=[。！？])/)
  const result: string[] = []
  const seenLongSentences = new Set<string>()
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) { result.push(part); continue }
    const prevTrimmed = result.length > 0 ? result[result.length - 1].trim() : ''
    const isExactDuplicate = prevTrimmed === trimmed
    const isTailDuplicate =
      trimmed.length >= 3 && trimmed.length <= 24 &&
      prevTrimmed.length > trimmed.length && prevTrimmed.endsWith(trimmed)
    const isGlobalDuplicate = trimmed.length >= 12 && seenLongSentences.has(trimmed)
    if (isExactDuplicate || isTailDuplicate || isGlobalDuplicate) continue
    if (trimmed.length >= 12) seenLongSentences.add(trimmed)
    result.push(part)
  }
  return result.join('')
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

【トーン（やわらかさ）のルール】
・全体としてやわらかく穏やかなトーンで書くこと。事務的で硬い言い切りが続かないようにすること
・「〜が必要です」「〜してください」「〜すべきです」のような強い言い方は使わないこと。「〜いただけますと安心です」「引き続き見守ってまいります」のように、報告・お願いの調子にすること
・気になる点を伝えるときは、いきなり指摘から入らず、良い面や取り組まれている様子に触れてから「〜という場面もございました」とやわらかく続けること
・断定が続くと硬い印象になるため、「〜でいらっしゃいました」「〜な日もございました」「ゆっくりとお過ごしいただきました」のような、ゆとりのある言い回しを適度に混ぜること
・数値や事実を並べるときも、「〜となっております」「〜で推移しております」のように穏やかな語尾を用いること
・ただし、事実として観察された安全・健康上の所見（皮膚の異常・外傷・体調急変など）については、やわらかい言い回しで内容を弱めないこと。事実は正確に書いたうえで、伝え方だけを丁寧にすること

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
・「お気遣いいただけますよう、お願い申し上げます」は使わないこと（この表現は相手を気遣う言葉であり、ケアマネジャーに何かを依頼する結びとしては意味が逆転し不自然になる）。気になる点がない場合の結びは「今後もお気づきの点がございましたら、随時ご連絡いたします。」のように、こちらから連絡する姿勢で書くこと
・「目をつけています」「目をつけております」は使わないこと（監視・注視といった否定的な意味合いになる）。「注意深く見守っております」「留意しております」「気を配っております」などに言い換えること

【文の重複について（重要）】
・同じ文、または直前の文と同じ語尾を、続けて2回書かないこと（例：「〜いただけました。いただけました。」「〜お願い申し上げます。お願い申し上げます。」のような繰り返しは禁止）
・1つの内容は1回だけ述べ、言い換えたり繰り返したりして文章を長くしないこと

【出欠の表現ルール】
・欠席0日の場合：「お休みなく、予定利用日はすべてご利用いただけました。」
・欠席がある場合：「○日間ご利用いただき、○日お休みされました。」
・「〜についてみましたところ」「確認しましたところ」などの前置きは不要。出欠の事実を直接書くこと`

  // 現場の記録がある月は自動的に詳しく報告する。
  // それに加えて、加算対象・ケアプラン更新月など画面でチェックされた場合も詳しく報告する。
  const hasRecords = stats.careNotes.length > 0 || stats.serviceGaps.length > 0
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

  const serviceGapsText = stats.serviceGaps.length > 0
    ? stats.serviceGaps.map(g => {
        const d = g.date.split('-')
        return `${parseInt(d[1])}月${parseInt(d[2])}日［${g.label}］未実施・理由: ${g.reason}`
      }).join('\n')
    : 'なし（予定していたサービスは滞りなく提供できました）'

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

■ サービスが実施できなかった記録（入浴・機能訓練）
${serviceGapsText}

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
・入浴・機能訓練・口腔ケアが「何回実施できたか」という報告は一切しないこと。「入浴は○回、機能訓練も○回、口腔ケアは○回実施しました」のような回数の列挙は禁止。実施回数の数字は本文中に一切出さないこと。
・その代わり、上記「サービスが実施できなかった記録」に記載がある場合は、その内容（日付・サービス名・理由）を中心に報告すること。実施できなかった記録がない場合は「予定していたサービスは滞りなく提供できました」のように簡潔に触れる程度にとどめ、回数は書かないこと。
・書く材料が少ないからといって、回数の列挙で文章を長くすることは絶対にしないこと。書く内容が乏しい場合は、無理に長くせず簡潔にまとめること。
・口腔ケアについては、上記「現場の記録」に口腔ケアに関する具体的な特記事項（トラブル・状態の変化など）が記載されている場合にのみ触れること。単に実施できなかった日数があるというだけでは触れないこと（理由の記録がない実施有無のばらつきは日常的な変動であり、報告すべき特記事項ではない）。特記事項がなければ口腔ケアには一切言及しないこと（「入浴・機能訓練・口腔ケアを通じて」のような定型文にも含めないこと）。
${hasRecords ? `・上記「現場の記録」がある場合はその内容をもとに、①デイで実際に観察された具体的な事実（日付・部位・状況など）、②介護職員・機能訓練指導員としての見解（原因の推測や状態の解釈）、③デイでの対応内容、④ご自宅での様子や対応について、ケアマネジャーに確認・共有をお願いする一文、の4つの要素を1つの段落の中に自然な流れで盛り込むこと。④は「ご自宅での○○について、ケアマネジャー様からもご確認いただけますと幸いです。」のように、具体的に何を確認してほしいかが分かる形で必ず含めること。【事実】【評価】のような見出しやラベルは付けず、普通の報告文として書くこと。` : forceDetailed ? `・回数の列挙で分量を稼ぐのではなく、活動への参加の様子や取り組み方、機能訓練での様子など、実際に観察できた具体的な内容を中心に記載すること。` : `・今月はこの利用者について特段の変化がありません。定型的な一文（例:「入浴・機能訓練を通じて、いつも通り穏やかにお過ごしいただきました。」）に、気づいた点があれば一言添える程度の簡潔な記載（2文程度）にとどめ、長く書きすぎないこと。口腔ケアには触れないこと。`}
${forceDetailed ? `
【この利用者は「詳しく報告する」指定です（全体に関わる最重要指示）】:
・加算対象・ケアプラン更新月・状態に変化があった方として指定されています。ケアマネジャーが加算の判断や次期計画の作成に使える報告書にしてください。
・すべての見出しについて、通常より踏み込んだ内容にすること。各見出しは3〜5文とすること（上記の「2〜4文程度」より、この指定を優先する）。【ケアサービス・活動の様子】と【気になる点・お伝えしたいこと】は特に厚く書くこと。
・「特に変わりありません」「問題なくお過ごしです」で済ませないこと。数値や記録に現れている範囲で、必ず具体的な観察内容を書くこと。
・現場の記録が少ない場合でも、以下の観点から書ける材料を探して具体的に記述すること（実施回数の列挙は禁止）：
　－ 活動やレクリエーションへの参加の仕方、意欲、他の利用者や職員との関わり方
　－ 機能訓練への取り組み方、無理なく続けられている動作、負担が大きそうな動作
　－ バイタル・食事・水分・体重の数値から読み取れる傾向（月内での変化の有無、安定しているならその事実を根拠とともに）
　－ 入浴・移動・排泄などの場面での介助量の変化や、ご自身でできている部分
・【気になる点・お伝えしたいこと】には、次の2点を必ず含めること：
　－ 今後デイとして続けていく方針・重点的に見ていく点
　－ 次回のケアプラン更新や加算の判断にあたって、ケアマネジャーと共有・相談したい事柄（無い場合は「現在の計画内容で支障なく経過しております」のように、判断材料になる形で明示すること）
・ただし、記録に無いことを推測で作文しないこと。事実として書ける材料が本当に乏しい項目は、無理に膨らませず簡潔にまとめること。
` : ''}
【今月の概況】
【バイタル・健康状態】
【食事・水分の様子】
【ケアサービス・活動の様子】
【気になる点・お伝えしたいこと】`

  try {
    const client = new Groq({ apiKey })
    const models = await resolveGroqModels(client)
    // 本文が空で返るモデル（思考過程だけを返す推論型など）に当たった場合は次の候補を試す
    const attempts: string[] = []
    for (const model of models.slice(0, 3)) {
      const completion = await client.chat.completions.create({
        model,
        // 詳しく報告する指定のときは、途中で切れないよう上限を広げる
        max_tokens: forceDetailed ? 2500 : 1500,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
      })
      const choice = completion.choices[0]
      const raw = stripReasoning(choice?.message?.content ?? '')
      if (raw) {
        console.log('[generateCareReport] 生成成功:', model)
        return sanitizeReportText(raw)
      }
      attempts.push(`${model}（終了理由: ${choice?.finish_reason ?? '不明'}）`)
      console.error('[generateCareReport] 空応答:', model, choice?.finish_reason)
    }
    return `【生成エラー】モデルから本文が返りませんでした。試したモデル: ${attempts.join(' / ')}`
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[generateCareReport] Groq API error:', detail)
    return `【APIエラー】${detail}`
  }
}
