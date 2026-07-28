import { requireSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

interface GoalInput {
  issue?: string
  longTermGoal?: string
  shortTermGoal?: string
}

interface RequestBody {
  needsAnalysis?: string
  supportPolicy?: string
  careLevel?: string
  goals?: GoalInput[]
}

export async function POST(request: Request) {
  await requireSession()

  const body: RequestBody = await request.json()

  const goalsText = (body.goals ?? [])
    .filter(g => g.issue || g.longTermGoal || g.shortTermGoal)
    .map((g, i) => `${i + 1}. 課題: ${g.issue ?? ''} / 長期目標: ${g.longTermGoal ?? ''} / 短期目標: ${g.shortTermGoal ?? ''}`)
    .join('\n')

  const context = [
    body.careLevel ? `要介護度: ${body.careLevel}` : '',
    body.needsAnalysis ? `【課題分析の結果】\n${body.needsAnalysis}` : '',
    body.supportPolicy ? `【総合的な援助の方針】\n${body.supportPolicy}` : '',
    goalsText ? `【援助目標】\n${goalsText}` : '',
  ].filter(Boolean).join('\n\n')

  if (!context.trim()) {
    return new Response('課題分析・援助方針・援助目標のいずれかを入力してから提案してください', { status: 400 })
  }

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          '以下は通所介護計画書に記載されている、ある利用者の課題分析結果・援助方針・援助目標です。',
          'この内容を踏まえて、計画書の「ゴールのイメージ」欄に記載する文章を日本語で提案してください。',
          '',
          '条件:',
          '- 本人が将来的に目指す、具体的で前向きな生活の姿を1〜2文で簡潔に書くこと',
          '- 抽象的な表現ではなく、この利用者の内容に即した具体的な内容にすること',
          '- 説明や前置き、見出しは一切不要。提案する文章のみを出力すること',
          '',
          context,
        ].join('\n'),
      },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return new Response('提案の生成に失敗しました', { status: 500 })
  }

  return Response.json({ suggestion: textBlock.text.trim() })
}
