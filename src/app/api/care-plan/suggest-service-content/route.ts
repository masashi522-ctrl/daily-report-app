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
    max_tokens: 500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    messages: [
      {
        role: 'user',
        content: [
          '以下は通所介護計画書の、ある1つの援助目標（解決すべき課題・長期目標・短期目標）に関する情報です。',
          'この課題・目標を達成するために、通所介護（デイサービス）の現場で実際にどのようなケア・支援を行うか、具体的な「サービス内容」を提案してください。',
          '',
          'この提案は実地指導（行政の監査）で確認されることを想定しています。実地指導で重視されるのは「なぜこの利用者に、このデイサービスで、この訓練・介助を行うのか」という根拠（アセスメントと支援内容のつながり）です。',
          'ケアプラン（総論）の内容をそのまま繰り返すのではなく、通所介護の現場でしか書けない具体的な支援内容・観察ポイントに展開してください。',
          '',
          '出力先の計画書はA4用紙1枚に収める必要があるため、簡潔さが非常に重要です。各項目は一文を短く、要点のみを記載してください（体言止めや箇条書きらしい短い言い回しを使い、説明的な言い回しは避けること）。',
          '',
          '出力は次の3セクション構成で、見出しはそのまま【】付きで出力してください（改行で区切ること）。',
          '',
          '【支援内容】',
          '箇条書き（・）で最大3項目。各項目は「具体的な支援・介助の内容（15字前後）」＋「（根拠を8字前後で括弧内に一言）」の形にし、1項目は40字以内に収めること。動作・場面が分かる具体的な表現にし、一般論・抽象的な表現は避けること。',
          '',
          '【観察ポイント】',
          '箇条書き（・）で最大2項目。1項目20字前後で、支援中・支援後に確認すべき具体的な観察項目のみを短く記載すること（例:「・歩行時のふらつきの有無」）。',
          '',
          '【認知機能訓練】',
          'このセクションは、解決すべき課題・長期目標・短期目標のいずれかに、物忘れ・認知機能低下・認知症予防・見当識・記憶などに関する記述が含まれる場合のみ必ず記載すること。含まれない場合はこのセクション自体（見出しごと）を省略すること。記載する場合は箇条書き（・）で最大2項目、1項目20字前後で、回想法・脳トレ・見当識訓練など具体的な訓練名のみを短く記載すること。',
          '',
          '他の条件:',
          '- 短期目標の達成に直接つながる内容にすること。他のサービス種別（訪問介護等）の内容は含めないこと',
          '- 「現在のサービス内容」が総論的・簡潔な記載（ケアマネジャー作成の計画書などからの引用）である場合は、それを踏まえて具体的な現場のケア内容に展開すること',
          '- 全セクション合計で7項目を超えないこと。項目数・文字数の上限は必ず守ること',
          '- 上記フォーマット（見出しと箇条書き）以外の説明・前置きは一切出力しないこと',
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
