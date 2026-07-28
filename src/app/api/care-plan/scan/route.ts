import { requireSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

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
    careLevel: { type: 'string', description: '要介護度（例: 要介護2）' },
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
  const file = formData.get('file')

  if (!(file instanceof File)) return new Response('file is required', { status: 400 })
  const isPdf = file.type === PDF_TYPE
  if (!isPdf && !SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return new Response('対応していないファイル形式です（JPEG/PNG/GIF/WEBP/PDFのみ）', { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const base64 = buf.toString('base64')

  const client = new Anthropic()

  const sourceBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: PDF_TYPE as 'application/pdf', data: base64 } }
    : {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
      }

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema: CARE_PLAN_SCAN_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          sourceBlock,
          {
            type: 'text',
            text: [
              'これは介護施設の「通所介護計画書」の写真・スキャン画像、またはPDFデータです。',
              '記載されている内容を読み取り、指定されたJSONスキーマに従って出力してください。',
              '日付はすべて西暦のYYYY-MM-DD形式に変換してください（令和・平成などの和暦表記は西暦に変換すること）。',
              '手書き文字も可能な限り読み取ってください。読み取れない項目・記載がない項目は空文字列にしてください。',
              '援助目標の表は、記入されている行をすべて抽出してください（空欄の行は含めない）。',
              '複数ページのPDFの場合は、全ページの内容を確認して抽出してください。',
            ].join('\n'),
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
    return Response.json(parsed)
  } catch {
    return new Response('読み取り結果の解析に失敗しました', { status: 500 })
  }
}
