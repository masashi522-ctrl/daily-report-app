import 'server-only'
import path from 'path'
import { createCanvas, GlobalFonts, type SKRSContext2D, type Canvas } from '@napi-rs/canvas'
import type { Resident, DailyRecord } from '@/types/database'
import { serviceTimeRangeFromNotes } from './attendance-stats'

// 連絡帳をLINEで送るための画像を作る。
// A5の用紙をそのまま縮小するとスマホでは字が小さくて読めないため、
// 紙と同じ項目を縦長のスマホ向けに並べ直している。

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')
let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'MPLUS1p-Regular.ttf'), 'MPLUS1p')
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'MPLUS1p-Bold.ttf'), 'MPLUS1pBold')
  fontsReady = true
}

const W = 1080
const PAD = 48
const INNER = W - PAD * 2

const C = {
  bg: '#ffffff',
  title: '#0f766e',
  titleText: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  label: '#374151',
  labelBg: '#f3f4f6',
  cardBorder: '#e5e7eb',
  accent: '#0f766e',
  noteBg: '#f0fdf9',
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function bathingLabel(bathing: string, skipReason: string | null): string {
  if (bathing === 'DONE') return '有'
  if (bathing === 'NOT_DONE') return `無（${skipReason ?? '理由不明'}）`
  return '対象外'
}

/** 日本語は単語の区切りが無いので、幅を見て1文字ずつ折り返す */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue }
    let line = ''
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > maxWidth && line !== '') {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    if (line !== '') lines.push(line)
  }
  return lines
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

type Row = { label: string; value: string }

/**
 * 高さが内容で変わるので、一度測ってから本番の canvas に描く。
 * measure=true のときは描画せず必要な高さだけを返す。
 */
function render(
  resident: Resident,
  record: DailyRecord | null,
  date: string,
  facilityName: string,
  aiDaily: string,
  aiRehab: string,
  height: number,
  measure: boolean,
): { canvas: Canvas; height: number } {
  ensureFonts()
  const canvas = createCanvas(W, Math.max(height, 10))
  const ctx = canvas.getContext('2d')

  if (!measure) {
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, height)
  }

  let y = 0

  // ── ヘッダー ────────────────────────────────────────────────
  const headerH = 132
  if (!measure) {
    ctx.fillStyle = C.title
    ctx.fillRect(0, 0, W, headerH)
    ctx.fillStyle = C.titleText
    ctx.font = '30px MPLUS1p'
    ctx.fillText(facilityName, PAD, 52)
    ctx.font = '44px MPLUS1pBold'
    ctx.fillText('れんらくちょう', PAD, 105)
  }
  y = headerH + 40

  // ── 氏名と日付 ──────────────────────────────────────────────
  const [yr, mo, dy] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  if (!measure) {
    ctx.fillStyle = C.text
    ctx.font = '54px MPLUS1pBold'
    ctx.fillText(`${resident.name}　様`, PAD, y + 44)
    ctx.fillStyle = C.muted
    ctx.font = '30px MPLUS1p'
    ctx.fillText(`${yr}年${mo}月${dy}日（${DOW_JA[dow]}）`, PAD, y + 92)
  }
  y += 128

  if (!measure) {
    ctx.strokeStyle = C.cardBorder
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
  }
  y += 40

  // 記録が無い日
  if (!record) {
    if (!measure) {
      ctx.fillStyle = C.muted
      ctx.font = '32px MPLUS1p'
      ctx.fillText('この日の記録はありません', PAD, y + 32)
    }
    return { canvas, height: y + 100 }
  }

  if (record.isAbsent) {
    if (!measure) {
      ctx.fillStyle = C.text
      ctx.font = '38px MPLUS1pBold'
      ctx.fillText('本日はお休みでした', PAD, y + 38)
      if (record.absenceReason) {
        ctx.fillStyle = C.muted
        ctx.font = '30px MPLUS1p'
        ctx.fillText(`理由：${record.absenceReason}`, PAD, y + 90)
      }
    }
    return { canvas, height: y + (record.absenceReason ? 150 : 100) }
  }

  // ── 項目 ────────────────────────────────────────────────────
  const temp = (v: number | null) => (v != null ? `${v}℃` : '―')
  const bp = (s: number | null, d: number | null) => (s != null ? `${s}/${d ?? '―'}` : '―')
  const num = (v: number | null, unit: string) => (v != null ? `${v}${unit}` : '―')
  const fluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
  const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch

  // 紙の連絡帳と同じく提供時間を載せる。その日だけ変わった場合は
  // 特記事項の記載を優先する
  const changed = serviceTimeRangeFromNotes(record.specialNotes)
  const start = changed?.start ?? resident.serviceStartTime
  const end = changed?.end ?? resident.serviceEndTime

  const rows: Row[] = [
    {
      label: changed ? '利用時間※' : '利用時間',
      value: start && end ? `${start} 〜 ${end}` : '―',
    },
    { label: '体温', value: `午前 ${temp(record.tempMorning)} ／ 午後 ${temp(record.tempAfternoon)}` },
    { label: '血圧', value: `午前 ${bp(record.bpSystolic, record.bpDiastolic)} ／ 午後 ${bp(record.bpSystolicPm, record.bpDiastolicPm)}` },
    { label: '脈拍', value: `午前 ${num(record.pulse, '')} ／ 午後 ${num(record.pulsePm, '')}` },
    { label: 'お食事', value: `主食 ${record.mealMainFood != null ? record.mealMainFood + '割' : '―'} ／ 副食 ${record.mealSideFood != null ? record.mealSideFood + '割' : '―'}` },
    { label: '水分', value: fluid > 0 ? `約 ${fluid}ml` : '―' },
    { label: '入浴', value: bathingLabel(record.bathing, record.bathingSkipReason) },
    { label: '口腔ケア', value: record.oralCare ? '実施' : '未実施' },
    { label: 'お薬', value: `朝 ${record.medicationMorning ? '有' : '無'} ／ 昼 ${lunchMed ? '有' : '無'} ／ 夕 ${record.medicationEvening ? '有' : '無'}` },
    { label: '排便', value: record.bowelAmount || record.bowelQuality ? [record.bowelAmount, record.bowelQuality].filter(Boolean).join('・') : '―' },
    { label: '機能訓練', value: record.trainingDone ? '実施' : '未実施' },
  ]

  const rowH = 68
  const labelW = 220
  for (const [i, row] of rows.entries()) {
    if (!measure) {
      if (i % 2 === 0) {
        ctx.fillStyle = '#fafafa'
        ctx.fillRect(PAD, y, INNER, rowH)
      }
      ctx.fillStyle = C.label
      ctx.font = '30px MPLUS1pBold'
      ctx.fillText(row.label, PAD + 20, y + 44)
      ctx.fillStyle = C.text
      ctx.font = '32px MPLUS1p'
      ctx.fillText(row.value, PAD + labelW, y + 44)
    }
    y += rowH
  }
  y += 40

  if (changed) {
    if (!measure) {
      ctx.fillStyle = C.muted
      ctx.font = '26px MPLUS1p'
      ctx.fillText('※ 本日は利用時間が変更になりました', PAD + 20, y + 24)
    }
    y += 46
  }

  // ── 日中のご様子 ────────────────────────────────────────────
  // 特記事項（specialNotes）は職員向けのメモで、紙の連絡帳にも印字していない。
  // AIがご家族向けの文章に書き直したものだけを載せる
  const sections: { title: string; body: string }[] = []
  if (aiDaily.trim()) sections.push({ title: '日中のご様子・連絡事項', body: aiDaily.trim() })
  if (aiRehab.trim()) sections.push({ title: 'リハビリからの連絡事項', body: aiRehab.trim() })

  for (const s of sections) {
    ctx.font = '32px MPLUS1p'
    const lines = wrapText(ctx, s.body, INNER - 48)
    const lineH = 50
    const boxH = 74 + lines.length * lineH + 28

    if (!measure) {
      ctx.fillStyle = C.noteBg
      roundRect(ctx, PAD, y, INNER, boxH, 16)
      ctx.fill()
      ctx.strokeStyle = C.cardBorder
      ctx.lineWidth = 2
      roundRect(ctx, PAD, y, INNER, boxH, 16)
      ctx.stroke()

      ctx.fillStyle = C.accent
      ctx.font = '30px MPLUS1pBold'
      ctx.fillText(s.title, PAD + 24, y + 48)

      ctx.fillStyle = C.text
      ctx.font = '32px MPLUS1p'
      lines.forEach((ln, i) => ctx.fillText(ln, PAD + 24, y + 74 + (i + 1) * lineH - 12))
    }
    y += boxH + 28
  }

  y += 20
  if (!measure) {
    ctx.fillStyle = C.muted
    ctx.font = '24px MPLUS1p'
    ctx.fillText(`${facilityName}　${yr}年${mo}月${dy}日`, PAD, y + 24)
  }
  y += 60

  return { canvas, height: y }
}

/** 連絡帳のPNGを作る */
export function buildDailyReportImage(
  resident: Resident,
  record: DailyRecord | null,
  date: string,
  facilityName: string,
  aiDaily = '',
  aiRehab = '',
): Buffer {
  // 1回目で高さを測り、2回目で本番を描く
  const { height } = render(resident, record, date, facilityName, aiDaily, aiRehab, 10, true)
  const { canvas } = render(resident, record, date, facilityName, aiDaily, aiRehab, height, false)
  return canvas.toBuffer('image/png')
}
