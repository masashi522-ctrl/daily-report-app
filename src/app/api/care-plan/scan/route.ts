import { requireSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'
import { mergeGoalsBySameIssue } from '@/lib/care-plan-goals'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const PDF_TYPE = 'application/pdf'

const GOAL_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    issue: { type: 'string', description: '解決すべき課題（ニーズ）' },
    longTermGoal: { type: 'string', description: '長期目標' },
    shortTermGoal: { type: 'string', description: '短期目標' },
    serviceContent: { type: 'string', description: 'サービス内容' },
    frequency: { type: 'string', description: '頻度' },
  },
  required: ['issue', 'longTermGoal', 'shortTermGoal', 'serviceContent', 'frequency'],
  additionalProperties: false,
}

const CARE_PLAN_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    planDate: { type: 'string', description: '作成年月日。西暦のYYYY-MM-DD形式。読み取れなければ空文字列' },
    staffName: { type: 'string', description: '作成者' },
    birthDate: { type: 'string', description: '生年月日。西暦のYYYY-MM-DD形式。読み取れなければ空文字列' },
    careLevel: { type: 'string', description: '要介護度（例: 要介護2。数字は必ず半角で出力すること）' },
    needsAnalysis: { type: 'string', description: '利用者及び家族の生活に対する意向を踏まえた課題分析の結果' },
    supportPolicy: { type: 'string', description: '総合的な援助の方針' },
    goalImage: { type: 'string', description: 'ゴールのイメージ' },
    goals: { type: 'array', items: GOAL_ITEM_SCHEMA, description: '援助目標の一覧（複数行あれば全て抽出）' },
    monitoringDate: { type: 'string', description: 'モニタリング日。西暦のYYYY-MM-DD形式' },
    evaluationPeriodStart: { type: 'string', description: '評価期間の開始日。西暦のYYYY-MM-DD形式' },
    evaluationPeriodEnd: { type: 'string', description: '評価期間の終了日。西暦のYYYY-MM-DD形式' },
    evaluationContent: { type: 'string', description: 'サービス達成状況の評価内容' },
    explanationDate: { type: 'string', description: '説明日。西暦のYYYY-MM-DD形式' },
    explainerName: { type: 'string', description: '説明者' },
    familyConfirmation: { type: 'string', description: '利用者同意署名欄の記載内容' },
    proxySigner: { type: 'string', description: '代筆者署名欄（続柄）の記載内容' },
  },
  required: [
    'planDate', 'staffName', 'birthDate', 'careLevel', 'needsAnalysis', 'supportPolicy', 'goalImage',
    'goals', 'monitoringDate', 'evaluationPeriodStart', 'evaluationPeriodEnd', 'evaluationContent',
    'explanationDate', 'explainerName', 'familyConfirmation', 'proxySigner',
  ],
  additionalProperties: false,
}

export async function POST(request: Request) {
  await requireSession()

  const formData = await request.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  const facilityName = (formData.get('facilityName') as string) || ''

  if (files.length === 0) return new Response('file is required', { status: 400 })
  if (files.length > 10) return new Response('ファイルは10件までにしてください', { status: 400 })

  for (const f of files) {
    if (f.type !== PDF_TYPE && !SUPPORTED_IMAGE_TYPES.has(f.type)) {
      return new Response('対応していないファイル形式です（JPEG/PNG/GIF/WEBP/PDFのみ）', { status: 400 })
    }
  }

  const client = new Anthropic()

  const sourceBlocks = await Promise.all(files.map(async f => {
    const buf = Buffer.from(await f.arrayBuffer())
    const base64 = buf.toString('base64')
    return f.type === PDF_TYPE
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: PDF_TYPE as 'application/pdf', data: base64 } }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: f.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        }
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: CARE_PLAN_SCAN_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          ...sourceBlocks,
          {
            type: 'text',
            text: [
              '介護施設のケアプラン関連書類の写真・スキャン画像、またはPDFデータです。',
              '入力される書式は次の2種類のいずれかです。まずどちらの書式かを見極めてください。',
              '',
              '【書式A: 通所介護計画書】',
              `${facilityName || '施設'}が自ら作成する、単一事業所専用の計画書です。援助目標の表は5列（解決すべき課題（ニーズ）／長期目標／短期目標／サービス内容／頻度）で、1行1件のニーズに対応します。この場合は表の記入行をすべて抽出してください。`,
              '',
              '【書式B: 居宅サービス計画書(1)(2)（ケアマネジャー作成）】',
              '複数の事業所・複数のサービス（訪問介護、訪問看護、通所介護、福祉用具貸与、ショートステイ等）をまとめた計画書です。(1)には「利用者及び家族の生活に対する意向を踏まえた課題分析の結果」「総合的な援助の方針」等が記載され、(2)には表があります。',
              '(2)の表は、1つの生活課題（ニーズ）につき「長期目標」「短期目標」が1組あり、それに対応する「援助内容」として「サービス内容」「サービス種別」「頻度」「期間」の行が1つまたは複数（サービスごとに1行）並びます。',
              '「生活全般の解決すべき課題（ニーズ）」「長期目標」「短期目標」のセルは、複数の援助内容行にまたがって罫線で結合されている（＝同じ課題に対して複数のサービスが紐づいている）ことが多いので、上下のセルの結合状態を必ず確認してください。',
              '【重複禁止・統合ルール（最重要）】罫線で結合されたセルは「1つの課題」を表します。同じ課題（ニーズ）・長期目標・短期目標のセルにまたがる援助内容行が複数ある場合、出力するgoals配列にはその課題につき1件のみを出力してください。issue・longTermGoal・shortTermGoalの文言を複数のgoal項目にまたがって重複させてはいけません。その課題に紐づく複数のサービス内容・頻度は、1件のgoal項目の中で、それぞれを改行で区切って列挙してください（serviceContentとfrequencyそれぞれに複数行を改行区切りで入れる）。',
              facilityName ? [
                `${facilityName}が提供するサービスは「通所介護」です。`,
                '書式Bの場合、「サービス種別」欄が「通所介護」となっている行のみを対象にしてください（訪問介護・訪問看護・福祉用具貸与・短期入所生活介護など、通所介護以外のサービス種別の行は除外してください）。',
                '対象の行が、上記の統合ルールにより同じ課題を共有する複数の通所介護行である場合は、それらも1件のgoal項目にまとめ、サービス内容・頻度を改行区切りで列挙してください。',
                'サービス種別欄が「通所介護」以外の行の内容を、通所介護の行の内容と混同しないよう、特に注意してください。',
              ].join('\n') : '',
              '',
              '【共通の注意事項】',
              '- 用紙が回転・天地逆（上下逆さま）にスキャンされている場合があります。文字の向きに関わらず内容を正しく認識してください。',
              '- 各行を書き写した後、画像内の該当箇所ともう一度見比べて、列のずれ・取り違え・誤字がないか必ず確認してください。',
              '- 実際に画像に書かれている内容のみを転記し、読み取れない・記載がない項目は空文字列にしてください。存在しない内容を推測で作成しないでください。',
              '- 手書き文字も可能な限り正確に読み取ってください。崩し字で確信が持てない場合は、最も可能性の高い読み方を採用しつつ、明らかに不自然な内容にはしないでください。',
              '- 日付はすべて西暦のYYYY-MM-DD形式に変換してください（令和・平成・昭和などの和暦表記は西暦に変換すること）。',
              '- 完全に空欄の行は抽出しないでください。',
              '- 複数ページのPDFの場合は、全ページの内容を確認してください。',
              files.length > 1
                ? '- 複数の画像・PDFが渡されています。同じ利用者・同じ計画書の別ページ、または関連する複数の資料です。すべてに目を通し、1件の計画書として内容を統合して抽出してください。同じ項目が複数の資料に重複して記載されている場合は、より詳しく書かれている方を優先してください。'
                : '',
            ].filter(text => text !== '').join('\n'),
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return new Response('画像の読み取りに失敗しました', { status: 500 })
  }

  try {
    const parsed = JSON.parse(textBlock.text)
    if (Array.isArray(parsed.goals)) {
      parsed.goals = mergeGoalsBySameIssue(parsed.goals)
    }
    return Response.json(parsed)
  } catch {
    return new Response('読み取り結果の解析に失敗しました', { status: 500 })
  }
}
