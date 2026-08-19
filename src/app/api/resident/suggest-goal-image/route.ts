import { requireSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

// この事業所の形体。将来的に施設ごとに設定できるようにする場合はここを差し替える
const FACILITY_TYPE = '通所介護（デイサービス）'

interface RequestBody {
  gender?: string
  goalImage?: string
  subGoalImage?: string
}

interface Suggestion {
  main: string
  subs: string[]
}

// モデルの応答からJSONを取り出す。前後に説明文が付いた場合にも対応する
function parseSuggestion(text: string): Suggestion | null {
  const jsonText = text.trim().startsWith('{')
    ? text.trim()
    : (text.match(/\{[\s\S]*\}/)?.[0] ?? '')
  if (!jsonText) return null
  try {
    const parsed = JSON.parse(jsonText) as { main?: unknown; subs?: unknown }
    const main = typeof parsed.main === 'string' ? parsed.main.trim() : ''
    const subs = Array.isArray(parsed.subs)
      ? parsed.subs.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(Boolean)
      : []
    return main ? { main, subs } : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  await requireSession()

  const body: RequestBody = await request.json()
  const goalImage = (body.goalImage ?? '').trim()
  const subGoalImage = (body.subGoalImage ?? '').trim()
  const gender = (body.gender ?? '').trim()

  if (!goalImage) {
    return new Response('メインのゴールのイメージを入力してから提案してください', { status: 400 })
  }

  const genderLabel = gender === '男' ? '男性' : gender === '女' ? '女性' : ''

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          `ACPの取り組みをしています。${FACILITY_TYPE}の${genderLabel || ''}利用者です。ゴールのイメージをシンプルな形で提案して欲しい。`,
          '',
          '担当職員が入力した、現時点でのメインのゴールのイメージ（仮）は次のとおりです。',
          goalImage,
          ...(subGoalImage
            ? ['', 'すでに入力されているサブのゴールのイメージは次のとおりです。これらと重複しない内容を提案してください。', subGoalImage]
            : []),
          '',
          'この内容をもとに、次の2種類を提案してください。',
          '- メインとなるゴールのイメージ: 1つ。ご本人が一番大切にしたいと思われる暮らしの姿',
          '- サブのゴールのイメージ: 2〜3つ。メインではないが、あわせて目指したい暮らしの姿',
          '',
          '条件:',
          '- 日本語で書くこと',
          '- それぞれ1文、40字程度のシンプルな表現にすること',
          '- 専門用語や「〜の向上」のような硬い言い回しは避け、暮らしの場面が思い浮かぶ言葉にすること',
          '- 入力内容に沿った内容にし、書かれていない事実を作り出さないこと',
          '',
          '出力は次の形式のJSONのみとし、説明や前置きは一切書かないでください。',
          '{"main": "メインのゴールのイメージ", "subs": ["サブ1", "サブ2", "サブ3"]}',
        ].join('\n'),
      },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return new Response('提案の生成に失敗しました', { status: 500 })
  }

  const suggestion = parseSuggestion(textBlock.text)
  if (!suggestion) {
    return new Response('提案の生成に失敗しました。もう一度お試しください', { status: 500 })
  }

  return Response.json(suggestion)
}
