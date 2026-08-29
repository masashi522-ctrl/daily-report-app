// ゴールのイメージのプロンプトを、画面を通さずに試すための道具。
// 実行: npx tsx --env-file=.env.local src/scripts/try-goal-image.ts <利用者ID>
// 利用者IDを渡すと、その方の介護計画書を実際に読み込んで材料にする。
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildGoalImagePrompt, formatCarePlanContext, parseSuggestion } from '@/lib/goal-image-prompt'

// 画面から入力する項目。試したい内容に書き換えて使う
const CASE = {
  gender: '女',
}

const RUNS = 2

async function main() {
  const residentId = process.argv[2]
  let carePlanContext = ''

  if (residentId) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    const { data } = await db.from('CarePlan').select('*').eq('residentId', residentId).maybeSingle()
    carePlanContext = formatCarePlanContext(data)
    console.log('=== 介護計画書として渡す材料 ===')
    console.log(carePlanContext || '(なし)')
    console.log()
  }

  const client = new Anthropic()
  for (let i = 1; i <= RUNS; i++) {
    const res = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: buildGoalImagePrompt({ ...CASE, carePlanContext }) }],
    })
    const block = res.content.find(b => b.type === 'text')
    const s = block && block.type === 'text' ? parseSuggestion(block.text) : null
    console.log(`--- ${i}回目 ---`)
    console.log('メイン:', s?.main)
    s?.subs.forEach(x => console.log('サブ  :', x))
  }
}

main()
