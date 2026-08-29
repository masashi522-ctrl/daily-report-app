import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { buildGoalImagePrompt, formatCarePlanContext, parseSuggestion } from '@/lib/goal-image-prompt'

interface RequestBody {
  /** 編集画面から呼ばれたとき。介護計画書を材料にするために使う */
  residentId?: string
  gender?: string
  goalImage?: string
  subGoalImage?: string
}

// 介護計画書の全体を材料として取り出す。
// 他の施設の利用者を覗けないよう、先に施設が一致することを確かめる
async function fetchCarePlanContext(residentId: string, facilityId: string): Promise<string> {
  const { data: resident } = await supabase
    .from('Resident')
    .select('id')
    .eq('id', residentId)
    .eq('facilityId', facilityId)
    .maybeSingle()
  if (!resident) return ''

  const { data: plan } = await supabase
    .from('CarePlan')
    .select('*')
    .eq('residentId', residentId)
    .maybeSingle()

  return formatCarePlanContext(plan)
}

export async function POST(request: Request) {
  const session = await requireSession()

  const body: RequestBody = await request.json()
  const goalImage = (body.goalImage ?? '').trim()
  const subGoalImage = (body.subGoalImage ?? '').trim()
  const gender = (body.gender ?? '').trim()
  const residentId = (body.residentId ?? '').trim()

  const carePlanContext = residentId ? await fetchCarePlanContext(residentId, session.facilityId) : ''

  // 材料がまったく無いと、誰にでも当てはまる言葉しか出てこない
  if (!goalImage && !carePlanContext) {
    return new Response(
      '介護計画書を作成するか、メインのゴールのイメージを入力してから提案してください',
      { status: 400 },
    )
  }

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: buildGoalImagePrompt({
          gender,
          goalImage,
          subGoalImage,
          carePlanContext,
        }),
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
