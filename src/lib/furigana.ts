import kuromoji from 'kuromoji'
import path from 'path'

let cachedTokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null

function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (cachedTokenizer) return Promise.resolve(cachedTokenizer)
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') })
      .build((err, tokenizer) => {
        if (err) return reject(err)
        cachedTokenizer = tokenizer
        resolve(tokenizer)
      })
  })
}

export async function toFurigana(name: string): Promise<string> {
  const tokenizer = await getTokenizer()
  const tokens = tokenizer.tokenize(name)
  const katakana = tokens.map(t => t.reading ?? t.surface_form).join('')
  // katakana → hiragana
  return katakana.replace(/[ァ-ヶ]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  )
}
