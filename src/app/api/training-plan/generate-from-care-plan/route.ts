import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import type { CarePlan } from '@/types/database'

const GOAL_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    issue: { type: 'string', description: '解決すべき課題（ニーズ）。機能訓練の観点で記載' },
    longTermGoal: { type: 'string', description: '長期目標（機能・活動・参加）' },
    shortTermGoal: { type: 'string', description: '短期目標（機能・活動・参加・3か月）' },
    serviceContent: { type: 'string', description: 'サービス内容（具体的な訓練内容）' },
    frequency: { type: 'string', description: '頻度（例: 週2回・20分）' },
  },
  required: ['issue', 'longTermGoal', 'shortTermGoal', 'serviceContent', 'frequency'],
  additionalProperties: false,
}

const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    needsAnalysis: { type: 'string', description: '利用者及び家族の生活に対する意向を踏まえた課題分析の結果（機能訓練の観点から）' },
    supportPolicy: { type: 'string', description: '総合的な援助の方針（機能訓練の観点から）' },
    goalImage: { type: 'string', description: 'ゴールのイメージ' },
    socialParticipation: { type: 'string', description: '社会参加の状況。介護計画書の内容から読み取れる範囲で記載し、根拠が無ければ空文字列' },
    housingSituation: { type: 'string', description: '家屋の状況。介護計画書の内容から読み取れる範囲で記載し、根拠が無ければ空文字列' },
    goals: { type: 'array', items: GOAL_ITEM_SCHEMA, description: 'リハビリ目標の一覧（1件以上）' },
    trainingPrecautions: { type: 'string', description: '機能訓練実施上の留意事項（運動強度・負荷量等）' },
  },
  required: ['needsAnalysis', 'supportPolicy', 'goalImage', 'socialParticipation', 'housingSituation', 'goals', 'trainingPrecautions'],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const session = await requireSession()
  const { residentId } = await request.json() as { residentId?: string }

  if (!residentId) return new Response('residentId is required', { status: 400 })

  const { data: resident } = await supabase
    .from('Resident')
    .select('id, name')
    .eq('id', residentId)
    .eq('facilityId', session.facilityId)
    .maybeSingle()
  if (!resident) return new Response('Resident not found', { status: 404 })

  const { data: carePlan } = await supabase
    .from('CarePlan')
    .select('*')
    .eq('residentId', residentId)
    .maybeSingle()
  if (!carePlan) return new Response('介護計画書がまだ保存されていません', { status: 404 })

  const plan = carePlan as CarePlan

  const goalsText = (plan.goals ?? [])
    .filter(g => g.issue || g.longTermGoal || g.shortTermGoal || g.serviceContent)
    .map((g, i) => `${i + 1}. 課題: ${g.issue ?? ''} / 長期目標: ${g.longTermGoal ?? ''} / 短期目標: ${g.shortTermGoal ?? ''} / サービス内容: ${g.serviceContent ?? ''} / 頻度: ${g.frequency ?? ''}`)
    .join('\n')

  const context = [
    plan.careLevel ? `要介護度: ${plan.careLevel}` : '',
    plan.needsAnalysis ? `【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】\n${plan.needsAnalysis}` : '',
    plan.supportPolicy ? `【総合的な援助の方針】\n${plan.supportPolicy}` : '',
    plan.goalImage ? `【ゴールのイメージ】\n${plan.goalImage}` : '',
    goalsText ? `【援助目標】\n${goalsText}` : '',
  ].filter(Boolean).join('\n\n')

  if (!context.trim()) {
    return new Response('介護計画書の内容が空のため生成できません', { status: 400 })
  }

  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: GENERATE_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `${resident.name}様の通所介護計画書（介護計画書）の内容です。`,
          'この内容を踏まえて、同じ利用者の「個別機能訓練計画書」の下書きを作成してください。',
          '',
          '条件:',
          '- 介護計画書の課題・目標を機能訓練（身体機能の維持・回復、ADL、移動・移乗、入浴等の動作訓練）の観点に落とし込み直すこと。単なるコピーではなく、機能訓練の計画として具体的な内容にすること。',
          '- 【社会参加の状況】【家屋の状況】は、介護計画書の中に手がかりとなる記述がある場合のみ記載し、根拠が無ければ空文字列にすること。存在しない情報を推測で作成しないこと。',
          '- goalsは1件以上。介護計画書に複数の課題がある場合は、機能訓練として意味のある単位でまとめてよい。',
          '- 病名・既往歴・入退院日など、医学的な事実は一切含めないこと（このAI生成の対象外）。',
          '- 説明や前置き、見出しは一切不要。指定されたJSON形式のみを出力すること。',
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

  try {
    const parsed = JSON.parse(textBlock.text)
    return Response.json(parsed)
  } catch {
    return new Response('生成結果の解析に失敗しました', { status: 500 })
  }
}
