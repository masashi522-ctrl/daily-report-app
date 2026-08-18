import type Groq from 'groq-sdk'

// Groqは提供モデルの入れ替えが多く、モデル名を固定するとある日突然
// model_not_found（404）で生成が止まる。実際に利用できるモデルを問い合わせ、
// 下記の優先順で選ぶことで、モデルが廃止されても動き続けるようにする。
// 日本語の長文をそのまま本文として返す指示追従型のモデルを上位に、
// 思考過程を出力して本文が空になりやすい推論型モデルを下位に置いている。
const PREFERRED_MODELS = [
  'moonshotai/kimi-k2-instruct',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b',
]

// 音声・ガードレール・埋め込みなど、文章生成に使えないモデルを除外する
const NON_CHAT = /whisper|tts|guard|embed|prompt-?guard|safety/i

let cachedModels: string[] | null = null

/**
 * 生成に使えるGroqのモデル名を、優先順に返す。
 * GROQ_MODEL が設定されていればそれだけを使う（デプロイし直さずに切り替えられる）。
 * 設定が無ければ、アカウントで利用可能なモデルを優先順に並べて返す。
 * 先頭のモデルが空応答を返した場合に次を試せるよう、1つではなく一覧で返している。
 */
export async function resolveGroqModels(client: Groq): Promise<string[]> {
  const configured = process.env.GROQ_MODEL?.trim()
  if (configured) return [configured]
  if (cachedModels) return cachedModels

  const list = await client.models.list()
  const available = (list.data ?? []).map(m => m.id).filter(id => !NON_CHAT.test(id))
  if (available.length === 0) {
    throw new Error('利用可能なGroqモデルが見つかりませんでした。APIキーの権限を確認してください。')
  }

  const preferred = PREFERRED_MODELS.filter(id => available.includes(id))
  const rest = available.filter(id => !preferred.includes(id))
  cachedModels = [...preferred, ...rest]
  console.log('[groq] 利用可能モデル（優先順）:', cachedModels.join(', '))
  return cachedModels
}

/** 生成に使うモデルを1つだけ返す */
export async function resolveGroqModel(client: Groq): Promise<string> {
  return (await resolveGroqModels(client))[0]
}

/** モデル一覧の取得に失敗した場合などに使う、キャッシュを捨てるための関数 */
export function clearGroqModelCache() {
  cachedModels = null
}

// 推論型モデルが本文の前に付ける思考過程を取り除く
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()
}
