import crypto from 'crypto'

// LINEのチャネルアクセストークン・シークレットなど、DBに平文で置きたくない値の
// 暗号化・復号。'server-only' は付けない —— src/scripts の移行スクリプトからも
// Next.jsのサーバーランタイム外で使うため（ただし呼び出し元（line.ts等）は
// 既に 'server-only' でクライアントバンドルへの混入を防いでいる）。

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'v1:'

// 鍵はリクエスト時に解決する（ビルド時に環境変数が無くても失敗させないため）。
// 本番で未設定のときに既知の固定値へフォールバックすると、ソースを見た誰でも
// 復号できてしまうため、フォールバックは開発時のみ許可する（session.tsと同じ方針）。
function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY が設定されていません。環境変数を設定してください。')
    }
    return crypto.createHash('sha256').update('dev-only-insecure-encryption-key').digest()
  }
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY は32バイトをbase64にした値にしてください（例: crypto.randomBytes(32).toString("base64")）')
  }
  return buf
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX)
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * 復号する。PREFIXが無い値は、暗号化を導入する前に保存された平文としてそのまま返す
 * （既存データを壊さないための移行期間中の互換動作。
 * scripts/encrypt-line-secrets.ts で暗号化済みに揃えたら、この分岐は通らなくなる）。
 */
export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value

  const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const authTag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
