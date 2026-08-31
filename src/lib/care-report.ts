// 月次サービス報告書（ケアマネジャー向け）の生成処理。
// サーバーアクション（'use server'）はasync関数しかexportできないため、
// 本番に出す前にプロンプトの中身やトークン数を確かめられるよう、
// ログイン確認以外の処理をここに集めている（src/scripts/care-report-test.ts から同じ経路を試せる）。

import Anthropic from '@anthropic-ai/sdk'
import Groq from 'groq-sdk'
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

export function buildCareReportPrompt(
  stats: ReportStats,
  forceDetailed: boolean,
): { systemMessage: string; prompt: string } {
  const systemMessage = `あなたはデイサービスの担当職員として、ケアマネジャーに今月の利用状況を報告する月次サービス報告書を作成します。
以下のルールを必ず守ってください：

【言語ルール・最優先】
・出力は必ず日本語（ひらがな・カタカナ・漢字・数字・句読点）のみで記述すること
・ハングル・簡体字・英単語など、日本語以外の文字を一切混在させないこと（「状态」「记录」のような簡体字は日本語の字体で書くこと）
・数字はアラビア数字（1、2、3）で書くこと。「八月十一日」「三センチ」「二名」のような漢数字は使わないこと（「一緒に」「十分に」「お一人で」のような言葉はそのままでよい）

【文体・表現のルール】
・文体は「です・ます」調。丁寧さは保ちながらも、硬すぎず読みやすい自然な文章にすること
・利用者の氏名は報告書全体を通じて最初の1回のみ使用し、以降は「ご利用者」で統一すること（「ご本人」は使わないこと）
・「問題ありません」「特に問題なく」など抽象的な表現は避け、具体的な状態・傾向を伝えること
・ケアマネジャーが利用者の状態を把握できるよう、必要な情報を分かりやすく伝えること
・「指摘」や「指示」の口調にならないよう注意し、あくまで「報告」の文章にすること
・「食事量が少ない」「体重が減少」「活動が困難」などのネガティブな表現は、できるかぎりポジティブな表現に言い換えること（例：「少しずつ召し上がっていただいております」「変化に気を配りながら経過を見守っております」「サポートしながら楽しんで取り組まれています」など）
・ただしポジティブな言い換えが不自然になる場合は、柔らかく中立的な表現にとどめること
・この言い換えルールは、日々の様子に関する一般的な表現にのみ適用すること。皮膚状態の異常・外傷・体調急変など、事実として観察された安全・健康上の所見は、婉曲化・軽視せず、正確にそのまま報告すること（例：「発赤を確認しました」を「少し気になる様子でした」のように弱めないこと）

【誰が行ったことかを取り違えないこと（重要）】
・「現場の記録」に書かれている行為が、デイの職員が行ったことなのか、ご利用者やご家族がなさったことなのかを見分けて書くこと
・職員が行った対応（湿布を貼る、患部を保護する、水分を勧める、見守る、体位を変えるなど）を、観察したように書かないこと。「湿布を貼付されていることを確認しております」は誤りで、「湿布を貼らせていただきました」「湿布での対応をさせていただきました」のように、自分たちが行ったこととして書くこと
・ご利用者やご家族がなさったことを、デイが行ったように書かないこと。ご家庭での出来事は「〜とのことでした」「〜と伺っております」と、聞き取った形で書くこと

【姿勢のルール（最重要・全体に関わる）】
・書き手はデイサービスの一職員であり、読み手であるケアマネジャーに対しては、あくまで謙虚な姿勢でご報告する立場です
・ケアマネジャーに対して指導・評価・指示をするような書き方は絶対にしないこと。「〜が必要と考えられます」「〜すべきです」「〜が望まれます」のような助言・提言はしないこと
・ケアマネジャーがご判断される事柄（加算の該当可否、要介護区分、サービス内容や回数の見直しなど）には立ち入らないこと。「加算」「判断材料」「区分変更」「サービスの見直し」といった言葉は使わないこと
・デイ側の見解を述べるときは、「私どもとしては〜と感じております」「〜のように見受けられました」のように控えめに書くこと（記録に残っている事実そのものは、控えめにせず言い切ること）
・こちらで分からないこと（ご家庭でのご様子など）は、「お差し支えなければお教えいただけますと幸いです」「ご様子をご存じでしたらお聞かせいただけますと幸いです」のように、お願いする形で書くこと
・専門家として断定する口調や、成果を誇るような書き方はしないこと。「〜できるようになりました」と強調するより、「〜なさる場面が増えてまいりました」のように穏やかに書くこと
・結びは「引き続き、安心してお過ごしいただけるよう努めてまいります。今後ともよろしくお願いいたします。」のように、謙虚な姿勢で締めること

【トーン（やわらかさ）のルール】
・全体としてやわらかく穏やかなトーンで書くこと。事務的で硬い言い切りが続かないようにすること
・「〜が必要です」「〜してください」「〜すべきです」のような強い言い方は使わないこと。「〜いただけますと安心です」「引き続き見守ってまいります」のように、報告・お願いの調子にすること
・気になる点を伝えるときは、いきなり指摘から入らず、良い面や取り組まれている様子に触れてから「〜という場面もございました」とやわらかく続けること
・断定が続くと硬い印象になるため、「〜でいらっしゃいました」「〜な日もございました」「ゆっくりとお過ごしいただきました」のような、ゆとりのある言い回しを適度に混ぜること
・事実を並べるときも、「〜となっております」「〜で推移しております」のように穏やかな語尾を用いること
・ただし、事実として観察された安全・健康上の所見（皮膚の異常・外傷・体調急変など）については、やわらかい言い回しで内容を弱めないこと。事実は正確に書いたうえで、伝え方だけを丁寧にすること

【使ってはいけない表現・言い換えルール】
・「〜を行いました」→「〜でした」「〜されました」に言い換えること（例：「ご利用を行いました」→「ご利用でした」）
・確認できている事実に「〜のようです」「〜と思われます」などの推量表現を付けないこと。「〜でした」「〜いただけました」と言い切ること
・「〜を行っていただいているようです」のような二重の遠回し表現は使わないこと
・「〜することができました」は多用しないこと。「〜いただきました」「〜されました」「〜でした」で言い換えること
・介護現場で使わない格式語・文語（「享受」「鑑みて」など）は使わないこと
・「〜についてみましたところ」「〜の様子です」など回りくどい導入は使わないこと
・「お休み、いただかれなかった」のような不自然な敬語表現は使わないこと
・「今月は落ち着いてお過ごしいただいております」のように、状態の説明に「今月は」を付けないこと。前の月はそうではなかった、という誤解を生みます。他の月と比べる書き方はせず、その月の事実だけを述べること

【文の重複について（重要）】
・同じ文や同じ語尾を続けて繰り返さないこと。1つの内容は1回だけ述べ、言い換えて文章を長くしないこと

【出欠の表現ルール】
・出欠は指定された一文のとおりに書くこと。別の言い方に変えたり、複数の言い方を重ねたりしないこと
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
    : 'なし'

  // 欠席の有無で書き方が決まるため、モデルに選ばせず一文を確定させる
  const attendanceSentence = stats.absentCount === 0
    ? '「お休みなく、予定利用日はすべてご利用いただけました。」'
    : `「${stats.attendanceCount}日間ご利用いただき、${stats.absentCount}日お休みされました。」`

  const prompt = `以下の記録をもとに、${stats.residentName}様の${stats.year}年${stats.month}月の月次サービス利用報告書を作成してください。
書き出しは「${stats.residentName}様の今月のご利用状況についてご報告いたします。」という一文から始め、以降は氏名を繰り返さないこと。

■ 利用状況
利用日数: ${stats.attendanceCount}日、欠席: ${stats.absentCount}日

■ サービスが実施できなかった記録（入浴・機能訓練）
${serviceGapsText}

■ 現場の記録（特記事項・入浴/機能訓練の申し送りメモ・その日の様子）
${careNotesText}

■ この利用者の介護計画書（通所介護計画書）の内容
${carePlanText}

---
上記の記録をもとに、ひと続きの文章として報告書を作成してください。段落は空行で区切り、箇条書きは使わないでください。

【書き方の禁止事項（最重要）】
・【】付きの見出し、「1．」「①」「■」のような番号や記号、題名、日付は書かないこと（題名と日付は書類の上部に別途印刷されます）
・血圧・脈拍・体温・体重・食事量・水分量の数値は、グラフで別途お渡しするため本文に一切書かないこと。「血圧は安定しておりました」のように数値を伴わない言い方も避け、健康状態は「現場の記録」に記載がある事柄だけを書くこと
・入浴・機能訓練・口腔ケアの実施回数も書かないこと
・「8月5日には」「8月25日と29日には」のように日付を挙げて出来事を並べないこと。ひと月を通してどうだったかをまとめて書くこと。日付を書いてよいのは、3つ目の段落で健康や安全に関わる出来事をお伝えするときだけです
・数字を使ってよいのは、書き出しの利用日数・欠席日数と、上記の日付だけです
・介護計画書の目標に書かれている内容（歩行距離・回数・できるようになりたい動作など）を、実際にあった出来事として書かないこと。事実として書いてよいのは「現場の記録」にある場面だけです
・1つの出来事は1つの段落だけに書くこと。3つ目の段落で取り上げた出来事を、2つ目の段落で繰り返さないこと

【全体の構成（この順に、段落を分けて書くこと）】

1つ目の段落（書き出し）
・「${stats.residentName}様の今月のご利用状況についてご報告いたします。」に続けて、出欠の状況を ${attendanceSentence} と書くこと。この一文はそのまま使い、他の言い方を重ねないこと
・この段落はこの2文だけにすること。ひと月の全体的な印象をここでまとめようとしないこと

2つ目の段落（デイでのご様子）
${hasRecords ? `・「現場の記録」を材料に、活動やレクリエーション・機能訓練・入浴・お食事などの場面でのご様子を${forceDetailed ? '4〜6文' : '3〜4文'}で総括すること
・記録を日付順に並べて羅列しないこと。似た内容はひとまとめにして、ひと月を通した傾向として書くこと
・そのうえで、特に印象に残る出来事を1つか2つ、どのような場面だったかが分かるように具体的に書くこと。日付は書かず、「月の後半には」「回を重ねるにつれて」のような書き方にすること
・ご本人の表情・お言葉・意欲、ご自身でなさっている場面と介助をさせていただいている場面など、記録から読み取れるご様子を含めること
・口腔ケアについては、「現場の記録」に具体的な特記事項（トラブルや状態の変化など）がある場合にのみ触れること。無ければ一切言及しないこと
・書いてよいのは「現場の記録」に実際に書かれている場面だけです。記録に無い場面を、ありそうな様子として補わないこと
・「サービスが実施できなかった記録」がある場合のみ、その理由に簡潔に触れること。記録が「なし」の月は、「予定していたサービスは滞りなく提供しました」のような一文も含めて、この話題に一切触れないこと${hasCarePlan ? `
・この方には介護計画書があります。援助目標（特に短期目標とサービス内容）に関係する記録を中心に選び、その場面が目標にどうつながっているか、ゴールのイメージに向けて今月の取り組みがどう位置づくかが伝わるように書くこと
・目標に関係する記録が無い援助目標には触れないこと。「援助目標1については」のように目標を並べて1つずつ講評する書き方もしないこと
・目標の文言をそのまま引き写さず、実際の様子として自然に言い換えること
・記録に目標と関係の薄い出来事しか無い月は、無理に結びつけず、その月の様子をそのまま書くこと` : ''}` : `・今月はこの利用者について、記録が1件もありません。したがって、書ける具体的な場面はひとつもありません
・この段落は必ず2文以内にすること。3文以上書いてはいけません
・入浴・機能訓練・レクリエーションなどの場面を思い浮かべて描写することを禁じます。「〜されていました」「〜という様子が見られました」といった、記録に無い観察を書かないこと
・「特記すべき出来事の記録はなく、日々の活動にご参加いただきました。」のような、確実に言える範囲の2文にとどめること`}

3つ目の段落（気になる点・お伝えしたいこと）
${hasRecords ? `・この段落に書いてよいのは、健康や安全に関わる記録（体調の変化、発熱、痛み、皮膚の異常、外傷、ふらつきや転倒、食事や服薬に関することなど）がある場合だけです
・そうした記録が無い月は、活動の話をここで繰り返さず、「体調面で特にお伝えすべき変化はございませんでした。今後もお気づきの点がございましたら、随時ご連絡いたします。」の2文だけで終えること。良かった点や気づきを書き足さないこと
・2つ目の段落で書いた活動・日付・場面を、この段落で言い換えて再登場させることは禁止です
・健康や安全に関わる記録がある場合は、その中からお伝えしたい事柄を1つだけ選び、①デイで実際に観察された具体的な事実（日付・部位・状況など）、②介護職員・機能訓練指導員としての見解（原因の推測や状態の解釈）、③デイでの対応内容、を1つの段落の中に自然な流れで書くこと

【ケアマネジャーへの確認のお願いについて（重要）】
・「ケアマネジャー様からもご確認いただけますと幸いです」という依頼は、毎月書くものではありません。本当に必要なときだけ書くこと
・依頼してよいのは、次のいずれかに当てはまる場合だけです：
　－ 原因や経緯がデイでは分からない（自宅で生じた外傷やあざなど）
　－ ご自宅でも続いている可能性があり、様子を知る必要がある
　－ ご自宅での対応や環境を変えたほうがよさそう
　－ 受診やご家族への相談につながりうる変化である
・デイの中で完結し、対応も済んで経過が落ち着いている事柄には依頼を付けないこと。事実と対応をお伝えしたうえで、「引き続き様子を見てまいります」のように結ぶこと
・依頼を書く場合は1つの報告書に1つまで。「ご自宅での○○について、ケアマネジャー様からもご確認いただけますと幸いです。」のように、何を確認してほしいかが分かる形で書くこと
・依頼先は必ず「ケアマネジャー様」とすること。この報告書の読み手はケアマネジャーであり、ご家族に直接お願いする書き方（「ご家族の方にもご確認いただけますと幸いです」など）はしないこと
・【事実】【評価】のような見出しやラベルは付けず、普通の報告文として書くこと` : `・お伝えする出来事はありません。「体調面で特にお伝えすべき変化はございませんでした。」と率直にお伝えし、気になる点を無理に挙げないこと
・続けて「今後もお気づきの点がございましたら、随時ご連絡いたします。」と書くこと`}
・ケアマネジャーがご判断される事柄（加算・要介護区分・サービス内容の見直しなど）には立ち入らないこと。あくまでデイでのご様子をお伝えするにとどめること

4つ目の段落（結び）
${hasCarePlan ? `・介護計画書の「ゴールのイメージ」に触れながら、2文以内で締めること
・ゴールのイメージの文言をそのまま鉤括弧で引用すると「『〜したい』という実現に向けて」のような不自然な文になるため、「ご家族とお買い物に出かけられることを目標に、」のように自然な言い回しに直して使うこと
・ゴールのイメージがない場合は援助目標の長期目標で代用すること
・そのうえで「引き続き、安心してお過ごしいただけるよう努めてまいります。今後ともよろしくお願いいたします。」の趣旨で締めること` : `・「引き続き、安心してお過ごしいただけるよう努めてまいります。今後ともよろしくお願いいたします。」のように、謙虚な姿勢で2文以内で締めること`}

---
出力は次の形にすること（【】や記号は使わず、空行で区切った4つの段落だけを出力すること）:

（書き出しと出欠の段落）

（デイでのご様子の段落）

（気になる点・お伝えしたいことの段落）

（結びの段落）`

  return { systemMessage, prompt }
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

// 決まりきった言い換えは、プロンプトで指示するより確実で、トークンも使わない。
// 「〜することができました」の多用を避けるといった、判断が要るものはプロンプト側に残している。
const PHRASE_FIXES: [RegExp, string][] = [
  [/弊社|当社/g, '私ども'],
  [/清潔を保つことができました/g, '清潔にお過ごしいただきました'],
  [/安らかに過ごすことができました/g, '穏やかにお過ごしいただきました'],
  [/過ごしていただいているようです/g, 'お過ごしいただきました'],
  [/目をつけて(います|おります)/g, '注意深く見守っております'],
  [/お気遣いいただけますよう、?お願い申し上げます。?/g, '今後もお気づきの点がございましたら、随時ご連絡いたします。'],
  [/寄与(する|したい|してまいります)/g, 'お役に立てるよう努めてまいります'],
  [/お日柄/g, '陽気'],
  // 「今月は」を付けると前の月との対比になり、先月は落ち着いていなかったのかと読まれてしまう
  [/今月は落ち着いてお過ごしいただいております。?/g, '体調面で特にお伝えすべき変化はございませんでした。'],
]

// 数字はアラビア数字に統一する。ただし「一緒に」「十分に」「お一人で」のような語まで
// 変換してしまうと日本語が壊れるため、日付や単位が続く場合だけ置き換える。
const KANJI_NUMBER_UNITS = '月|日|回|名|センチ|ミリ|メートル|キロ|グラム|割|枚|個|ml|cc'
const KANJI_NUMBER_PATTERN = new RegExp(`([〇零一二三四五六七八九十百千]+)(?=(?:${KANJI_NUMBER_UNITS}))`, 'g')
const KANJI_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

/** 「二十」「三百五十」のような漢数字を数値に直す。読めない並びは null を返す */
function kanjiToArabic(text: string): number | null {
  let total = 0
  let current = 0
  let seen = false
  for (const ch of text) {
    const digit = KANJI_DIGITS[ch]
    if (digit != null) {
      current = current * 10 + digit
      seen = true
      continue
    }
    const unit = ch === '十' ? 10 : ch === '百' ? 100 : ch === '千' ? 1000 : null
    if (unit == null) return null
    total += (current || 1) * unit
    current = 0
    seen = true
  }
  return seen ? total + current : null
}

function normalizeKanjiNumbers(text: string): string {
  return text.replace(KANJI_NUMBER_PATTERN, matched => {
    const value = kanjiToArabic(matched)
    return value == null ? matched : String(value)
  })
}

function sanitizeReportText(text: string): string {
  const fixed = [...SIMPLIFIED_CHINESE_FIXES, ...PHRASE_FIXES]
    .reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
  return collapseRepeatedSentences(normalizeKanjiNumbers(stripStrayForeignScript(fixed)))
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

// Groqは「プロンプトのトークン数 + max_tokens」が1分あたりの上限（TPM）を超えると413を返す。
// 同じ内容で送り直しても必ず失敗するため、エラー文に含まれる上限と要求量から超過分を割り出し、
// その分だけmax_tokensを削って送り直す。
const TOKEN_LIMIT_PATTERN = /Limit (\d+), Requested (\d+)/
// これ以上削ると報告書が途中で切れるため、下回る場合は諦めて次のモデルに移る
const MIN_MAX_TOKENS = 1000
// 削った後にちょうど上限に張り付かないようにするための余裕
const TOKEN_MARGIN = 200

function shrinkMaxTokens(err: unknown, current: number): number | null {
  const message = err instanceof Error ? err.message : String(err)
  const matched = TOKEN_LIMIT_PATTERN.exec(message)
  if (!matched) return null
  const excess = Number(matched[2]) - Number(matched[1])
  if (!Number.isFinite(excess) || excess <= 0) return null
  const next = current - excess - TOKEN_MARGIN
  return next >= MIN_MAX_TOKENS ? next : null
}

// 生の英語エラー（JSON混じり）をそのまま画面に出さず、職員が読んで意味の分かる一言にする
function describeGroqError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (DAILY_LIMIT_PATTERN.test(message)) return '1日あたりのトークン上限に達しました'
  if (TOKEN_LIMIT_PATTERN.test(message)) return '1分あたりのトークン上限を超えました'
  if (/rate.?limit|429/i.test(message)) return '利用が集中しているため一時的に制限されました'
  if (/401|invalid.?api.?key|unauthorized/i.test(message)) return 'APIキーが受け付けられませんでした'
  if (/model_not_found|404/i.test(message)) return 'モデルが利用できませんでした'
  return message.slice(0, 120)
}

// gpt-ossなどの推論型モデルは、本文の前に思考過程を生成し、その分もmax_tokensを消費する。
// 何も指定しないと思考だけで上限に達し、本文が数十文字で切れてしまうため、思考は最小限にする。
function reasoningEffortFor(model: string): 'low' | undefined {
  return /gpt-oss|qwen3|deepseek-r1/i.test(model) ? 'low' : undefined
}

// 実際にGroqに投げて報告書の本文を得る。サーバーアクションから切り離してあるので、
// 本番に出す前に src/scripts/care-report-test.ts から同じ経路を試せる。
export type CareReportResult =
  | { ok: true; text: string; model: string }
  | { ok: false; message: string; retryAfterSec?: number; daily?: boolean }

// 429の本文には「Please try again in 10.5375s」「9m21.6s」のように再開までの時間が入っている。
// 分・時間を含む書き方もあるため、まとめて読み取る。
const RETRY_AFTER_PATTERN = /try again in (?:([\d.]+)h)?(?:([\d.]+)m)?(?:([\d.]+)s)?/i
// 1分あたり（TPM）か、1日あたり（TPD）か。日の上限は待っても当日中には空かない
const DAILY_LIMIT_PATTERN = /tokens per day|\bTPD\b/i

function retryAfterSecFrom(err: unknown): number | undefined {
  const message = err instanceof Error ? err.message : String(err)
  if (!/rate.?limit|429/i.test(message)) return undefined
  const m = RETRY_AFTER_PATTERN.exec(message)
  if (!m || (!m[1] && !m[2] && !m[3])) return 60 // 読めない場合は1分の枠が空くのを待つ
  const hours = Number(m[1] ?? 0), minutes = Number(m[2] ?? 0), seconds = Number(m[3] ?? 0)
  return Math.ceil(hours * 3600 + minutes * 60 + seconds)
}

function isDailyLimit(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /rate.?limit|429/i.test(message) && DAILY_LIMIT_PATTERN.test(message)
}

/**
 * Groqで生成する（ANTHROPIC_API_KEY が無いときの予備）。
 * options.model を指定すると、そのモデルだけで生成する（まとめて生成するときに、
 * 利用者ごとに文体が変わらないよう、同じモデルで揃えるため）。
 */
async function generateWithGroq(
  apiKey: string,
  stats: ReportStats,
  forceDetailed: boolean,
  options: { model?: string } = {},
): Promise<CareReportResult> {
  const { systemMessage, prompt } = buildCareReportPrompt(stats, forceDetailed)

  try {
    const client = new Groq({ apiKey })
    const models = options.model ? [options.model] : (await resolveGroqModels(client)).slice(0, 3)
    const messages = [
      { role: 'system' as const, content: systemMessage },
      { role: 'user' as const, content: prompt },
    ]
    // Groqの1分あたりのトークン上限（無料枠のモデルでは8,000）は「プロンプトのトークン数 + max_tokens」で
    // 判定される。プロンプトは記録の多い月でも4,100トークン程度なので、下記の値なら上限に収まる。
    // 実測では本文は800トークン前後（reasoning_effort:'low' で思考分は100トークン程度）。
    // 途中で切れないよう3倍ほどの余裕を見つつ、プロンプトと合わせて上限に収まる値にしている。
    const baseMaxTokens = forceDetailed ? 2400 : 2000
    // 本文が空で返るモデル（思考過程だけを返す推論型など）や、
    // トークン上限・一時的な制限に当たったモデルで止まらないよう、次の候補を試す
    const attempts: string[] = []
    let rateLimited: number | undefined
    let dailyLimited = false
    for (const model of models) {
      let maxTokens: number | null = baseMaxTokens
      while (maxTokens != null) {
        const current: number = maxTokens
        try {
          const completion = await client.chat.completions.create({
            model,
            max_tokens: current,
            messages,
            ...(reasoningEffortFor(model) ? { reasoning_effort: reasoningEffortFor(model) } : {}),
          })
          const choice = completion.choices[0]
          const raw = stripReasoning(choice?.message?.content ?? '')
          if (raw) {
            const usage = completion.usage
            // 入力+出力が1分あたりの上限に対してどれくらいかを、本番のログでも確認できるようにする
            console.log('[generateCareReport] 生成成功:', model,
              `入力${usage?.prompt_tokens ?? '?'} + 出力${usage?.completion_tokens ?? '?'} トークン`)
            if (choice.finish_reason === 'length') {
              console.warn('[generateCareReport] max_tokensに達し、本文が途中で切れている可能性:', model, current)
            }
            return { ok: true, text: sanitizeReportText(raw), model }
          }
          attempts.push(`${model}（終了理由: ${choice?.finish_reason ?? '不明'}）`)
          console.error('[generateCareReport] 空応答:', model, choice?.finish_reason)
          maxTokens = null
        } catch (err) {
          const shrunk = shrinkMaxTokens(err, current)
          if (shrunk != null) {
            console.warn('[generateCareReport] トークン上限のため max_tokens を縮小:', model, current, '→', shrunk)
            maxTokens = shrunk
            continue
          }
          rateLimited = retryAfterSecFrom(err) ?? rateLimited
          dailyLimited = dailyLimited || isDailyLimit(err)
          attempts.push(`${model}（${describeGroqError(err)}）`)
          console.error('[generateCareReport] 生成失敗:', model, err)
          maxTokens = null
        }
      }
    }
    if (rateLimited != null) {
      return {
        ok: false,
        message: dailyLimited ? '1日あたりのトークン上限に達しました' : '1分あたりのトークン上限に達しました',
        retryAfterSec: rateLimited,
        daily: dailyLimited,
      }
    }
    return { ok: false, message: `報告書を作成できませんでした。試したモデル: ${attempts.join(' / ')}` }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[generateCareReport] Groq API error:', detail)
    return { ok: false, message: `${describeGroqError(err)}（詳細: ${detail.slice(0, 200)}）`, retryAfterSec: retryAfterSecFrom(err), daily: isDailyLimit(err) }
  }
}

// 介護計画書のスキャンやゴールのイメージの提案と同じモデルに揃えている。
// Groqの無料枠と違い1日あたりの上限が実質問題にならないため、月末に全員分を続けて作れる。
const CLAUDE_MODEL = 'claude-opus-5'

async function generateWithClaude(stats: ReportStats, forceDetailed: boolean): Promise<CareReportResult> {
  const { systemMessage, prompt } = buildCareReportPrompt(stats, forceDetailed)
  const client = new Anthropic()

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      // 施設の全員分を続けて作るため、利用者によらず同じ文言の指示はキャッシュさせる
      system: [{ type: 'text', text: systemMessage, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    })

    if (response.stop_reason === 'refusal') {
      console.error('[generateCareReport] 生成を拒否されました:', response.stop_reason)
      return { ok: false, message: '内容の判定により生成できませんでした。記録の書き方をご確認ください' }
    }

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (!raw) {
      return { ok: false, message: 'モデルから本文が返りませんでした' }
    }

    const usage = response.usage
    console.log('[generateCareReport] 生成成功:', CLAUDE_MODEL,
      `入力${usage.input_tokens}（キャッシュ読み${usage.cache_read_input_tokens ?? 0}）+ 出力${usage.output_tokens} トークン`)
    if (response.stop_reason === 'max_tokens') {
      console.warn('[generateCareReport] max_tokensに達し、本文が途中で切れている可能性があります')
    }

    return { ok: true, text: sanitizeReportText(raw), model: CLAUDE_MODEL }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      const retryAfter = Number(err.headers?.get?.('retry-after') ?? 60)
      return {
        ok: false,
        message: '利用が集中しているため一時的に制限されました',
        retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60,
      }
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: 'ANTHROPIC_API_KEY が受け付けられませんでした' }
    }
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[generateCareReport] Claude API error:', detail)
    return { ok: false, message: detail.slice(0, 200) }
  }
}

/**
 * 報告書を生成し、成否と使ったモデルを返す。
 * ANTHROPIC_API_KEY があればClaudeで生成し、無ければGroqにまわす。
 * options.model はGroqを使う場合のみ意味を持つ。
 */
export async function generateCareReportResult(
  stats: ReportStats,
  forceDetailed: boolean,
  options: { model?: string } = {},
): Promise<CareReportResult> {
  if (process.env.ANTHROPIC_API_KEY) return generateWithClaude(stats, forceDetailed)

  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    return { ok: false, message: 'ANTHROPIC_API_KEY も GROQ_API_KEY も設定されていません' }
  }
  return generateWithGroq(groqApiKey, stats, forceDetailed, options)
}

/** 1人分だけ画面から生成するとき用。エラーは画面に出す日本語の文字列で返す */
export async function generateCareReportText(
  stats: ReportStats,
  forceDetailed: boolean,
): Promise<string> {
  const result = await generateCareReportResult(stats, forceDetailed)
  if (result.ok) return result.text
  const wait = result.retryAfterSec ? `約${result.retryAfterSec}秒おいてから、もう一度お試しください。` : ''
  return `【生成エラー】${result.message}。${wait}`
}