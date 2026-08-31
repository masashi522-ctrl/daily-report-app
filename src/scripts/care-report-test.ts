// ケアマネジャー向け月次報告書を、本番に出す前に手元で確かめるためのスクリプト。
// 画面の「報告書を生成」と同じ処理（src/lib/care-report.ts）を通るので、
// ・1分あたりのトークン上限（TPM）に当たらないか
// ・本文が途中で切れないか
// ・どのモデルが選ばれるか
// をまとめて確認できる。データベースには一切触れない。
//
// 実行方法（PowerShell）: .env.local の GROQ_API_KEY は空で降りてくるため、キーを直接渡す。
//   $env:GROQ_API_KEY='gsk_...'; npx tsx src/scripts/care-report-test.ts          （詳しく報告する指定＝いちばん重い条件）
//   $env:GROQ_API_KEY='gsk_...'; npx tsx src/scripts/care-report-test.ts light    （通常の条件）
//   $env:GROQ_API_KEY='gsk_...'; npx tsx src/scripts/care-report-test.ts empty    （記録がまったく無い月）
//
// キーを渡さずに実行すると、API呼び出しはせずプロンプトの長さと見込みトークン数だけを表示する。
//
// 注意: 無料枠は1分あたり8,000トークンのため、続けて2回実行すると2回目が
// 制限に当たることがある。1分ほど間隔をあけて実行すること。

import Groq from 'groq-sdk'
import { resolveGroqModels } from '@/lib/groq-model'
import { buildCareReportPrompt, generateCareReportText, type ReportStats } from '@/lib/care-report'

// 記録の多い月を想定した、いちばんプロンプトが長くなる条件のデータ
const stats: ReportStats = {
  residentName: 'テスト 太郎',
  year: 2026,
  month: 8,
  attendanceCount: 12,
  absentCount: 2,
  bpSystolicAvg: 132.4, bpDiastolicAvg: 78.2, pulseAvg: 72.6, tempAvg: 36.4,
  fluidAvg: 820, mealMainAvg: 8.2, mealSideAvg: 7.6,
  bathingCount: 11, attendanceForBathing: 12, trainingCount: 12, oralCareCount: 10,
  weightAvg: 52.3, weightMin: 51.8, weightMax: 52.9, weightMeasureCount: 4,
  careNotes: [
    { date: '2026-08-04', label: '特記事項', text: '朝の送迎時に右膝の痛みを訴えられ、歩行時に少しかばう様子が見られました。' },
    { date: '2026-08-06', label: '入浴', text: '浴槽をまたぐ際にふらつきがあり、二名介助で対応しました。' },
    { date: '2026-08-07', label: '機能訓練', text: '立ち上がり訓練を10回。後半は疲労の訴えがあり回数を減らしました。' },
    { date: '2026-08-11', label: '特記事項', text: '左前腕に3センチほどの内出血を確認。ご家族に確認したところ、自宅で家具にぶつけたとのことでした。' },
    { date: '2026-08-13', label: 'その日の様子', text: '塗り絵の活動に他の利用者と一緒に取り組まれ、笑顔が多く見られました。' },
    { date: '2026-08-18', label: '入浴', text: '背部に軽度の発赤を確認し、看護職員へ報告しました。' },
    { date: '2026-08-20', label: '機能訓練', text: '歩行器を使った歩行が20メートルまで延びました。' },
    { date: '2026-08-25', label: '特記事項', text: '午後に37.2度の微熱があり、水分をこまめにお勧めして経過を見ました。夕方には36.6度まで下がりました。' },
  ],
  dailyNotes: [],
  carePlan: {
    goalImage: '家族と一緒に近所のスーパーまで歩いて買い物に行けるようになりたい',
    goals: [
      { issue: '下肢筋力の低下により歩行が不安定', longTermGoal: '屋外を安全に歩行できる', shortTermGoal: '歩行器を使って30メートル歩ける' },
      { issue: '入浴時の転倒リスクがある', longTermGoal: '安全に入浴を継続できる', shortTermGoal: '見守りのもとで浴槽をまたげる' },
    ],
  },
  serviceGaps: [
    { date: '2026-08-06', label: '入浴', reason: '体調不良：血圧が高かったため' },
    { date: '2026-08-25', label: '機能訓練', reason: '発熱：微熱があったため中止' },
  ],
}

// 健康・安全上の出来事が無く、活動の記録だけがある月（実際に多いパターン）
const ACTIVITY_NOTES = [
  { date: '2026-08-05', label: '機能訓練', text: '棒を使った体操を実施。ご自身のペースで取り組まれる。' },
  { date: '2026-08-12', label: '機能訓練', text: 'ゴムチューブを使った体操を実施。' },
  { date: '2026-08-20', label: '機能訓練', text: 'ボールを使った身体機能訓練を実施。' },
  { date: '2026-08-25', label: 'その日の様子', text: '脳トレプリントと漢字の課題に取り組まれる。' },
  { date: '2026-08-29', label: 'その日の様子', text: '箱折りと新聞を折る作業に取り組まれる。' },
  { date: '2026-08-31', label: 'その日の様子', text: '誕生日会に参加され、皆と過ごされる。' },
]
async function main() {
  // detailed=詳しく報告する指定 / light=通常 / empty=記録がまったく無い月
  const mode = process.argv[2] ?? 'detailed'
  const forceDetailed = mode === 'detailed'
  const target: ReportStats =
    mode === 'empty' ? { ...stats, careNotes: [], serviceGaps: [] }
    : mode === 'activity' ? { ...stats, careNotes: ACTIVITY_NOTES, serviceGaps: [] }
    : stats

  const { systemMessage, prompt } = buildCareReportPrompt(target, forceDetailed)
  const chars = [...systemMessage].length + [...prompt].length
  console.log('条件:', mode === 'empty' ? '記録が無い月' : mode === 'activity' ? '活動の記録だけの月' : forceDetailed ? '詳しく報告する指定' : '通常')
  console.log('プロンプト長:', chars, '文字（日本語はおおよそ0.8倍のトークン数）')

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const groqKey = process.env.GROQ_API_KEY
  if (!anthropicKey && !groqKey) {
    console.log('---')
    console.log('ANTHROPIC_API_KEY も GROQ_API_KEY も無いため、ここまで（実際の生成は行いません）。')
    console.log('--env-file=.env.local を付けて実行してください。')
    return
  }

  if (anthropicKey) {
    console.log('使うモデル: claude-opus-5（ANTHROPIC_API_KEY を使用）')
  } else {
    const models = await resolveGroqModels(new Groq({ apiKey: groqKey! }))
    console.log('使うモデル（Groq・優先順・上位3つまで試す）:', models.slice(0, 3).join(', '))
  }
  console.log('---')

  const started = Date.now()
  const text = await generateCareReportText(target, forceDetailed)
  console.log('---')
  console.log(text)
  console.log('---')
  console.log('本文:', [...text].length, '文字 /', Math.round((Date.now() - started) / 1000), '秒')
  if (/^【(APIエラー|生成エラー|設定エラー|エラー)】/.test(text)) console.error('！エラーが返っています。上のメッセージを確認してください。')
  else if (text.includes('【')) console.error('！見出し【】が混ざっています。見出しなしの文章になっていません。')
  else if (!/[。」]\s*$/.test(text)) console.error('！文の途中で終わっています。本文が切れている可能性があります。')
  else console.log('OK: 見出しなしの文章として、最後まで生成されています。段落数:', text.split(/\n\s*\n/).filter(x => x.trim()).length)
}

main().catch(err => { console.error(err); process.exit(1) })
