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
          sourceBlock,
          {
            type: 'text',
            text: [
              'これは介護施設の「通所介護計画書（ケアプラン）」の写真・スキャン画像、またはPDFデータです。',
              '正確な転記が最優先です。以下の手順で、慎重に読み取ってください。',
              '',
              '【援助目標の表について（最重要）】',
              '1. まず表の列見出しを画像から直接確認してください。一般的な列は左から「解決すべき課題（ニーズ）」「長期目標」「短期目標」「サービス内容」「頻度」の順ですが、実際の書式では順序や名称、列数が異なることがあります。必ず見出し文字そのものを確認し、思い込みで判定しないでください。',
              '2. 1行ずつ、その行の中でどのセルがどの列に属するかを罫線・位置関係から慎重に確認してから書き写してください。上下の行や隣の列の内容を混同しないよう、行ごとに完結させてから次の行に進んでください。',
              '3. 各行を書き写した後、画像内の該当箇所ともう一度見比べて、誤字・列のずれ・取り違えがないか必ず確認してください。',
              '4. 記入されている行のみ抽出し、完全に空欄の行は含めないでください。',
              '',
              '【全体の注意事項】',
              '- 実際に画像に書かれている内容のみを転記してください。読み取れない・記載がない項目は空文字列にし、存在しない内容を推測で作成しないでください。',
              '- 手書き文字も可能な限り正確に読み取ってください。崩し字で確信が持てない場合は、最も可能性の高い読み方を採用しつつ、明らかに不自然な内容にはしないでください。',
              '- 日付はすべて西暦のYYYY-MM-DD形式に変換してください（令和・平成などの和暦表記は西暦に変換すること）。',
              '- 複数ページのPDFの場合は、全ページの内容を確認してください。',
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
