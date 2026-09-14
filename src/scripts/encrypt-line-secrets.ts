import { createClient } from '@supabase/supabase-js'
import { encryptSecret, isEncryptedSecret } from '../lib/secrets'

// 平文のままDBに残っているLINEのチャネルアクセストークン・シークレットを
// 暗号化する一度きりの移行スクリプト。ENCRYPTION_KEY を設定してから実行すること。
// 実行方法: npx tsx src/scripts/encrypt-line-secrets.ts

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY が設定されていません。先に環境変数を設定してください。')
    process.exit(1)
  }

  const { data: facilities, error } = await supabase
    .from('Facility')
    .select('id, name, lineChannelAccessToken, lineChannelSecret')

  if (error) {
    console.error('取得に失敗しました:', error.message)
    process.exit(1)
  }

  let updated = 0
  let skipped = 0

  for (const f of facilities ?? []) {
    const updates: Record<string, string> = {}

    if (f.lineChannelAccessToken && !isEncryptedSecret(f.lineChannelAccessToken)) {
      updates.lineChannelAccessToken = encryptSecret(f.lineChannelAccessToken)
    }
    if (f.lineChannelSecret && !isEncryptedSecret(f.lineChannelSecret)) {
      updates.lineChannelSecret = encryptSecret(f.lineChannelSecret)
    }

    if (Object.keys(updates).length === 0) {
      skipped++
      continue
    }

    const { error: updateError } = await supabase.from('Facility').update(updates).eq('id', f.id)
    if (updateError) {
      console.error(`施設「${f.name}」の更新に失敗しました:`, updateError.message)
      continue
    }
    updated++
    console.log(`施設「${f.name}」のLINE設定を暗号化しました`)
  }

  console.log(`完了: ${updated}件を暗号化、${skipped}件は対象外（未設定または暗号化済み）`)
}

main()
