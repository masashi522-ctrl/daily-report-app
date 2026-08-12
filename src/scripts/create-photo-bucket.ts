// 集計・分析の月次報告書に添付する写真を保存するための、非公開Storageバケットを作成する一回限りのスクリプト。
// 実行方法: npx tsx src/scripts/create-photo-bucket.ts
// （NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY が環境変数に設定されている必要があります）

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BUCKET_NAME = 'resident-monthly-photos'

async function main() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET_NAME)
  if (existing) {
    console.log(`バケット "${BUCKET_NAME}" は既に存在します。作成をスキップします。`)
    return
  }

  const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: '8MB',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
  })

  if (error) {
    console.error('バケット作成エラー:', error.message)
    process.exitCode = 1
    return
  }

  console.log(`バケット "${BUCKET_NAME}" を非公開で作成しました。`)
}

main()
