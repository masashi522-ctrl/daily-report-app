// LINE送信のお試し用スクリプト。
// LINE公式アカウントを登録したあと、Webhookの設定をする前でも、
// 自分自身宛に連絡帳の画像を送って見た目と動作を確認できる。
//
// 実行方法:
//   npx tsx --conditions=react-server --env-file=.env.local src/scripts/line-test.ts <施設のslug> <あなたのユーザーID> [利用者名] [日付]
//
// 例:
//   ... src/scripts/line-test.ts genkimura U0a66... "折元和子" 2026-08-20
//
// トークンは施設ごとに「スタッフ」画面から登録した値を使う。
// <あなたのユーザーID> は LINE Developers コンソールの
// 「Messaging API設定」タブに表示される "あなたのユーザーID"（Uで始まる33文字）。
// 事前にその公式アカウントを友だち追加しておくこと（未追加だと送信できない）。

import crypto from 'crypto'
import { supabase } from '../lib/supabase'
import { getLineChannel, isLineUserId, pushMessages } from '../lib/line'
import { buildDailyReportImage } from '../lib/daily-report-image'
import { generateAIText, createGroqClient } from '../lib/daily-report-ai'
import type { Resident, DailyRecord } from '../types/database'

const BUCKET = 'resident-monthly-photos'

async function main() {
  const [slug, argUserId, residentName, dateArg] = process.argv.slice(2)
  const userId = argUserId || process.env.LINE_TEST_USER_ID || ''

  if (!slug) {
    console.error('施設のslugを指定してください（例: genkimura / mokumoku / suginoko）')
    process.exit(1)
  }

  const { data: facility } = await supabase.from('Facility').select('id, name').eq('slug', slug).maybeSingle()
  if (!facility) { console.error(`施設「${slug}」が見つかりません`); process.exit(1) }

  const channel = await getLineChannel(facility.id)
  if (!channel) {
    console.error(`「${facility.name}」のLINE設定が未登録です。スタッフ画面から登録してください。`)
    process.exit(1)
  }
  if (!isLineUserId(userId)) {
    console.error('ユーザーIDの形式が違います。Uで始まる33文字を指定してください。')
    console.error('LINE Developers コンソール →「Messaging API設定」→「あなたのユーザーID」')
    process.exit(1)
  }

  // 送る中身を用意する（実際の記録を1件借りる）
  let record: DailyRecord | null = null
  let resident: Resident | null = null

  if (residentName) {
    const { data } = await supabase.from('Resident').select('*')
      .eq('name', residentName).eq('facilityId', facility.id).limit(1).maybeSingle()
    if (!data) { console.error(`「${facility.name}」に利用者「${residentName}」が見つかりません`); process.exit(1) }
    resident = data as Resident
  }

  const date = dateArg || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

  if (resident) {
    const { data } = await supabase.from('DailyRecord').select('*')
      .eq('residentId', resident.id).eq('date', date).maybeSingle()
    record = (data as DailyRecord) ?? null
  } else {
    // 指定が無ければ、その施設で記録が入っているものを1件選ぶ
    const { data: rs } = await supabase.from('Resident').select('id').eq('facilityId', facility.id).eq('isActive', true)
    const ids = (rs ?? []).map(r => r.id)
    const { data } = await supabase.from('DailyRecord').select('*')
      .in('residentId', ids).not('tempMorning', 'is', null)
      .order('date', { ascending: false }).limit(1).maybeSingle()
    if (!data) { console.error('記録が1件も見つかりません'); process.exit(1) }
    record = data as DailyRecord
    const { data: r } = await supabase.from('Resident').select('*').eq('id', record.residentId).single()
    resident = r as Resident
  }

  console.log(`対象: ${resident!.name} 様 / ${record?.date ?? date} / ${facility.name}`)

  // AI文章（GROQ_API_KEY があれば本番と同じ文面になる）
  let ai = { daily: '', rehab: '' }
  const groq = await createGroqClient()
  if (groq && record) {
    console.log('AIで「日中のご様子」を生成中...')
    try {
      ai = await generateAIText(groq.client, groq.model, resident!, record, record.date)
    } catch (err) {
      console.warn('AI生成をスキップしました:', err instanceof Error ? err.message : err)
    }
  }

  console.log('連絡帳の画像を作成中...')
  const png = buildDailyReportImage(resident!, record, record?.date ?? date, facility.name, ai.daily, ai.rehab)
  console.log(`  画像サイズ: ${(png.length / 1024).toFixed(0)}KB`)

  const objectPath = `line/test/${crypto.randomUUID()}.png`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, png, {
    contentType: 'image/png', upsert: true,
  })
  if (upErr) { console.error('画像の保存に失敗:', upErr.message); process.exit(1) }

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60 * 24)
  if (!signed?.signedUrl) { console.error('画像のURL発行に失敗'); process.exit(1) }

  // LINEはこのURLへ画像を取りに来る。実際に取得できるか先に確かめる
  const probe = await fetch(signed.signedUrl)
  console.log(`  画像URLの確認: HTTP ${probe.status} / ${probe.headers.get('content-type')} / ${((await probe.arrayBuffer()).byteLength / 1024).toFixed(0)}KB`)
  if (!probe.ok) { console.error('画像URLにアクセスできません'); process.exit(1) }

  console.log('LINEへ送信中...')
  try {
    await pushMessages(channel.accessToken, userId, [
      { type: 'text', text: `【送信テスト】${facility.name}\nこの内容がご家族に届きます。` },
      { type: 'image', originalContentUrl: signed.signedUrl, previewImageUrl: signed.signedUrl },
    ])
    console.log('\n送信しました。LINEのトークを確認してください。')
    // LINEは送信APIの応答後に画像を取りに来るため、ここで消してはいけない
    console.log(`（画像は ${objectPath} に24時間残ります）`)
  } catch (err) {
    console.error('\n送信に失敗:', err instanceof Error ? err.message : err)
    console.error('※ その公式アカウントを友だち追加しているか確認してください')
    await supabase.storage.from(BUCKET).remove([objectPath])
    process.exit(1)
  }
}

main()
