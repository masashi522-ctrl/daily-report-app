import { requireSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

interface RequestBody {
  issue?: string
  longTermGoal?: string
  shortTermGoal?: string
  frequency?: string
  currentServiceContent?: string
  careLevel?: string
  facilityName?: string
}

export async function POST(request: Request) {
  await requireSession()

  const body: RequestBody = await request.json()

  if (!body.issue?.trim() && !body.longTermGoal?.trim() && !body.shortTermGoal?.trim()) {
    return new Response('課題・長期目標・短期目標のいずれかを入力してから生成してください', { status: 400 })
  }

  const context = [
    body.facilityName ? `事業所: ${body.facilityName}（通所介護）` : '',
    body.careLevel ? `要介護度: ${body.careLevel}` : '',
    body.issue ? `解決すべき課題（ニーズ）: ${body.issue}` : '',
    body.longTermGoal ? `長期目標: ${body.longTermGoal}` : '',
    body.shortTermGoal ? `短期目標: ${body.shortTermGoal}` : '',
    body.frequency ? `頻度: ${body.frequency}` : '',
    body.currentServiceContent ? `現在のサービス内容（参考・総論レベルの記載）: ${body.currentServiceContent}` : '',
  ].filter(Boolean).join('\n')

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 600,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          '以下は通所介護計画書の、ある1つの援助目標（解決すべき課題・長期目標・短期目標）に関する情報です。',
          'この課題・目標を達成するために、通所介護（デイサービス）の現場で実際にどのようなケア・支援を行うか、具体的な「サービス内容」を提案してください。',
          '',
          '条件:',
          '- 「現在のサービス内容」が総論的・簡潔な記載（ケアマネジャー作成の計画書などからの引用）である場合は、それを踏まえて、通所介護の現場で実際に行う具体的なケア内容（各論）に展開すること',
          '- 箇条書き（・）で3〜6項目程度、具体的な支援内容・ケア内容を列挙すること（例:「・立ち上がり動作を中心とした個別機能訓練の実施」「・入浴時の転倒防止のための見守り・声かけ」など、動作や場面が分かる具体的な表現にすること）',
          '- 短期目標の達成に直接つながる内容にすること。一般論や抽象的な表現、他のサービス種別（訪問介護等）の内容は避けること',
          '- 説明や前置き、見出しは一切不要。箇条書きの提案内容のみを出力すること',
          '',
          context,
        ].join('\n'),
      },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return new Response('生成に失敗しました', { status: 500 })
  }

  return Response.json({ suggestion: textBlock.text.trim() })
}
