import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function main() {
  const email = process.argv[2] || 'admin@dayservice.com'
  const password = process.argv[3] || 'admin1234'
  const name = process.argv[4] || '管理者'

  const hash = await bcrypt.hash(password, 10)

  const { error } = await supabase.from('Staff').insert({
    id: crypto.randomUUID(),
    email,
    password: hash,
    name,
    role: 'ADMIN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (error) {
    console.error('エラー:', error.message)
  } else {
    console.log(`管理者アカウント作成完了`)
    console.log(`メール: ${email}`)
    console.log(`パスワード: ${password}`)
  }
}

main()
