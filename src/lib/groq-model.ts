import type Groq from 'groq-sdk'

// Groqは提供モデルの入れ替えが多く、モデル名を固定するとある日突然
// model_not_found（404）で生成が止まる。実際に利用できるモデルを問い合わせ、
// 下記の優先順で選ぶことで、モデルが廃止されても動き続けるようにする。
// 日本語の長文生成に向くものを上位に置いている。
const PREFERRED_MODELS = [
  'moonshotai/kimi-k2-instruct',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
]

// 音声・ガードレール・埋め込みなど、文章生成に使えないモデルを除外する
const NON_CHAT = /whisper|tts|guard|embed|prompt-?guard|safety/i

let cachedModel: string | null = null

/**
 * 生成に使うGroqのモデル名を返す。
 * GROQ_MODEL が設定されていればそれを使う（デプロイし直さずに切り替えられる）。
 * 設定が無ければ、アカウントで利用可能なモデルの中から優先順に選ぶ。
 */
export async function resolveGroqModel(client: Groq): Promise<string> {
  const configured = process.env.GROQ_MODEL?.trim()
  if (configured) return configured
  if (cachedModel) return cachedModel

  const list = await client.models.list()
  const available = (list.data ?? []).map(m => m.id).filter(id => !NON_CHAT.test(id))
  if (available.length === 0) {
    throw new Error('利用可能なGroqモデルが見つかりませんでした。APIキーの権限を確認してください。')
  }

  cachedModel = PREFERRED_MODELS.find(id => available.includes(id)) ?? available[0]
  console.log('[groq] 使用モデル:', cachedModel, '（利用可能:', available.join(', '), '）')
  return cachedModel
}

/** モデル一覧の取得に失敗した場合などに使う、キャッシュを捨てるための関数 */
export function clearGroqModelCache() {
  cachedModel = null
}
