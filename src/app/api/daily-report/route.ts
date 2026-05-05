import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ExcelJS from 'exceljs'
import Groq from 'groq-sdk'
import type { Resident, DailyRecord } from '@/types/database'

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function addHoursToTime(timeStr: string, hours: number): string {
  const [h, mn = '0'] = timeStr.split(':')
  const total = parseInt(h) * 60 + parseInt(mn) + hours * 60
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

function bathingLabel(bathing: string, skipReason: string | null): string {
  if (bathing === 'DONE') return '有'
  if (bathing === 'NOT_DONE') return '無（' + (skipReason ?? '理由不明') + '）'
  return '対象外'
}

function sheetSafeName(name: string): string {
  return name.replace(/[:\\/?\[\]]/g, '').slice(0, 31)
}

async function generateAIText(
  client: Groq,
  resident: Resident,
  record: DailyRecord,
  dateStr: string,
): Promise<{ daily: string; rehab: string }> {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
  const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch
  const bpAm = record.bpSystolic != null ? record.bpSystolic + '/' + record.bpDiastolic : '未測定'
  const bpPm = record.bpSystolicPm != null ? record.bpSystolicPm + '/' + record.bpDiastolicPm : '未測定'
  const trainingTime = record.functionalTrainingStart
    ? record.functionalTrainingStart + '-' + (record.functionalTrainingEnd ?? '')
    : ''

  const context = [
    '利用者名: ' + resident.name,
    resident.careLevel ? '要介護区分: ' + resident.careLevel : '',
    '日付: ' + y + '年' + m + '月' + d + '日（' + DOW_JA[dow] + '曜日）',
    '体温: 午前 ' + (record.tempMorning ?? '未測定') + '℃ / 午後 ' + (record.tempAfternoon ?? '未測定') + '℃',
    '血圧: 午前 ' + bpAm + ' / 午後 ' + bpPm + ' mmHg',
    '脈拍: 午前 ' + (record.pulse ?? '未測定') + ' / 午後 ' + (record.pulsePm ?? '未測定') + ' 回/分',
    '食事: 主食 ' + (record.mealMainFood != null ? record.mealMainFood + '割' : '未記録') + ' 副食 ' + (record.mealSideFood != null ? record.mealSideFood + '割' : '未記録'),
    '水分: 計 ' + totalFluid + 'ml（午前 ' + (record.fluidIntakeAm ?? 0) + 'ml + 午後 ' + (record.fluidIntakePm ?? 0) + 'ml）',
    '入浴: ' + bathingLabel(record.bathing, record.bathingSkipReason),
    '口腔ケア: ' + (record.oralCare ? '実施' : '未実施'),
    '服薬: 朝' + (record.medicationMorning ? '有' : '無') + ' 昼' + (lunchMed ? '有' : '無') + ' 夕' + (record.medicationEvening ? '有' : '無'),
    '機能訓練: ' + (record.trainingDone ? '実施' + (trainingTime ? '（' + trainingTime + '）' : '') : '未実施'),
    record.specialNotes ? '特記事項: ' + record.specialNotes : '',
    resident.specialCondition ? '利用者特記: ' + resident.specialCondition : '',
  ].filter(Boolean).join('\n')

  const [dailyRes, rehabRes] = await Promise.all([
    client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: 'あなたはデイサービスの介護記録担当スタッフです。以下の当日記録をもとに「日中のご様子・連絡事項」欄の文章を自然な介護記録文体で３〜５文で作成してください。文章のみ出力してください。\n\n' + context,
      }],
    }),
    record.trainingDone
      ? client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: 'あなたはデイサービスの機能訓練担当スタッフです。以下の訓練記録をもとに「リハビリからの連絡事項」欄の文章を自然な記録文体で１〜２文で作成してください。文章のみ出力してください。\n\n' + context,
          }],
        })
      : Promise.resolve(null),
  ])

  return {
    daily: dailyRes.choices[0]?.message?.content ?? '',
    rehab: rehabRes?.choices[0]?.message?.content ?? '',
  }
}

// ─── カラーパレット ────────────────────────────────────────────────
const C = {
  hdrBg:    '0F766E',   // teal-700
  hdrFg:    'FFFFFF',
  subBg:    'CCFBF1',   // teal-100
  subFg:    '134E4A',   // teal-900
  vitalHdr: 'FECDD3',   // rose-200
  vitalBg:  'FFF1F2',   // rose-50
  vitalFg:  '9F1239',   // rose-800
  mealHdr:  'FDE68A',   // amber-200
  mealBg:   'FFFBEB',   // amber-50
  mealFg:   '92400E',   // amber-800
  medHdr:   'DDD6FE',   // violet-200
  medBg:    'F5F3FF',   // violet-50
  medFg:    '3730A3',   // violet-800
  trainHdr: 'BBF7D0',   // green-200
  trainBg:  'F0FDF4',   // green-50
  trainFg:  '166534',   // green-800
  notesHdr: 'E2E8F0',   // slate-200
  notesBg:  'F8FAFC',   // slate-50
  notesFg:  '0F172A',   // slate-900
  alertBg:  'FEE2E2',   // red-100
  alertFg:  'DC2626',   // red-600
  border:   'CBD5E1',   // slate-300
  label:    '64748B',   // slate-500
  value:    '0F172A',   // slate-900
  white:    'FFFFFF',
  svcBg:    'EFF6FF',   // blue-50
  svcFg:    '1E40AF',   // blue-800
}

type FillColor = { argb: string }
const a = (hex: string): FillColor => ({ argb: 'FF' + hex })

const FONT_NAME = 'メイリオ'

function buildSheet(
  wb: ExcelJS.Workbook,
  resident: Resident,
  record: DailyRecord | null,
  date: string,
  aiDaily: string,
  aiRehab: string,
) {
  const ws = wb.addWorksheet(sheetSafeName(resident.name), {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })

  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const reiwa = y - 2018

  const startTime = resident.serviceStartTime ?? '9:30'
  const cat = resident.serviceTimeCategory ?? ''
  const catH = cat ? parseInt(cat.split('-')[0]) : 0
  const endTime = catH > 0 ? addHoursToTime(startTime, catH) : '---'

  // ── カラム幅 ──────────────────────────────────────────────────────
  // A=sp  B=label  C=val  D=sp  E=label  F=val  G=sp  H=label  I=val  J=sp  K=label  L=val  M=sp
  ws.columns = [
    { width: 1.2 },   // A spacer
    { width: 10 },    // B label-1
    { width: 13 },    // C value-1
    { width: 1.2 },   // D spacer
    { width: 10 },    // E label-2
    { width: 13 },    // F value-2
    { width: 1.2 },   // G spacer
    { width: 10 },    // H label-3
    { width: 13 },    // I value-3
    { width: 1.2 },   // J spacer
    { width: 10 },    // K label-4
    { width: 13 },    // L value-4
    { width: 1.2 },   // M spacer
  ]

  // ── 罫線・スタイルヘルパー ────────────────────────────────────────
  const thin   = { style: 'thin'   as const, color: a(C.border) }
  const medium = { style: 'medium' as const, color: a(C.hdrBg) }
  const allB   = { top: thin, bottom: thin, left: thin, right: thin }

  type CellAddr = string
  type BorderSide = { style: ExcelJS.BorderStyle; color: FillColor }
  type BorderSpec = { top?: BorderSide; bottom?: BorderSide; left?: BorderSide; right?: BorderSide } | null
  type StyleOpts = {
    bg?: string; fg?: string; bold?: boolean; size?: number; italic?: boolean
    hAlign?: ExcelJS.Alignment['horizontal']
    vAlign?: ExcelJS.Alignment['vertical']
    wrap?: boolean; border?: BorderSpec
  }

  function sc(addr: CellAddr, value: string | number | null, opts: StyleOpts = {}) {
    const {
      bg = C.white, fg = C.value, bold = false, size = 9, italic = false,
      hAlign = 'left', vAlign = 'middle', wrap = false, border = allB,
    } = opts
    const cell = ws.getCell(addr)
    if (value !== null) cell.value = value
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: a(bg) }
    cell.font  = { name: FONT_NAME, size, bold, italic, color: a(fg) }
    cell.alignment = { horizontal: hAlign, vertical: vAlign, wrapText: wrap }
    if (border) cell.border = border
    return cell
  }

  function merge(range: string, addr: CellAddr, value: string | number | null, opts: StyleOpts = {}) {
    ws.mergeCells(range)
    return sc(addr, value, opts)
  }

  function spacerFill(addr: CellAddr, bg: string) {
    const cell = ws.getCell(addr)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: a(bg) }
  }

  // セクションヘッダー (A=アクセント縦線, B-M=タイトル)
  function sectionRow(row: number, label: string, hdr: string, fg: string, rowH = 19) {
    ws.getRow(row).height = rowH
    spacerFill(`A${row}`, fg)
    merge(`B${row}:M${row}`, `B${row}`, '  ' + label, {
      bg: hdr, fg, bold: true, size: 9, hAlign: 'left',
      border: { top: { style: 'medium', color: a(fg) }, bottom: thin, left: thin, right: thin },
    })
  }

  // ラベル + 値 セル
  function lv(row: number, lCol: string, vCol: string, label: string, value: string,
              lBg: string, lFg: string, vBg = C.white, vFg = C.value, vSize = 10) {
    sc(`${lCol}${row}`, label, { bg: lBg, fg: lFg, size: 8, hAlign: 'right', vAlign: 'middle', border: allB })
    sc(`${vCol}${row}`, value, { bg: vBg, fg: vFg, size: vSize, hAlign: 'center', vAlign: 'middle', border: allB })
  }

  let r = 1

  // ━━━ 1. タイトル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 34
  merge(`A${r}:M${r}`, `A${r}`, 'デイサービス　連絡帳', {
    bg: C.hdrBg, fg: C.hdrFg, bold: true, size: 16, hAlign: 'center', border: null,
  })
  r++

  // ━━━ 2. 利用者名 ＋ 日付 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 26
  spacerFill(`A${r}`, C.subBg)
  merge(`B${r}:G${r}`, `B${r}`, resident.name + '　様', {
    bg: C.subBg, fg: C.subFg, bold: true, size: 14, hAlign: 'center',
    border: { top: medium, bottom: thin, left: medium, right: thin },
  })
  merge(`H${r}:M${r}`, `H${r}`, `令和${reiwa}年　${m}月　${d}日（${DOW_JA[dow]}曜日）`, {
    bg: C.subBg, fg: C.subFg, size: 11, hAlign: 'center',
    border: { top: medium, bottom: thin, left: thin, right: medium },
  })
  r++

  // ━━━ 3. サービス提供時間 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 18
  spacerFill(`A${r}`, C.svcBg)
  merge(`B${r}:C${r}`, `B${r}`, 'サービス提供時間', {
    bg: C.svcBg, fg: C.svcFg, size: 8, hAlign: 'right',
  })
  merge(`E${r}:M${r}`, `E${r}`, `${startTime}　～　${endTime}　（${cat ? cat + '時間' : '未設定'}）`, {
    bg: C.white, fg: C.value, size: 10, hAlign: 'left',
  })
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 6; r++

  // ━━━ 4. バイタル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ バイタル', C.vitalHdr, C.vitalFg); r++

  // バイタル テーブルヘッダー
  ws.getRow(r).height = 16
  ;[
    [`B${r}:C${r}`, `B${r}`, '測定時間'],
    [`E${r}:F${r}`, `E${r}`, '体温（℃）'],
    [`H${r}:I${r}`, `H${r}`, '血圧（mmHg）'],
    [`K${r}:L${r}`, `K${r}`, '脈拍（/分）'],
  ].forEach(([range, addr, label]) =>
    merge(range as string, addr as string, label as string, {
      bg: C.vitalBg, fg: C.vitalFg, bold: true, size: 8, hAlign: 'center',
    })
  )
  r++

  // AM バイタル
  ws.getRow(r).height = 20
  const bpAmAlert = record != null &&
    ((record.bpSystolic != null && record.bpSystolic >= 160) ||
     (record.bpDiastolic != null && record.bpDiastolic >= 90))
  const bpAmStr = record?.bpSystolic != null
    ? `${record.bpSystolic}　/　${record.bpDiastolic ?? '?'}`
    : '　---　'

  merge(`B${r}:C${r}`, `B${r}`, '午前　9:30', { bg: C.vitalBg, fg: C.vitalFg, hAlign: 'center', size: 9 })
  merge(`E${r}:F${r}`, `E${r}`, record?.tempMorning != null ? String(record.tempMorning) : '---',
    { bg: C.white, fg: C.value, hAlign: 'center', size: 11 })
  merge(`H${r}:I${r}`, `H${r}`, bpAmStr,
    { bg: bpAmAlert ? C.alertBg : C.white, fg: bpAmAlert ? C.alertFg : C.value, bold: bpAmAlert, hAlign: 'center', size: 11 })
  merge(`K${r}:L${r}`, `K${r}`, record?.pulse != null ? String(record.pulse) : '---',
    { bg: C.white, fg: C.value, hAlign: 'center', size: 11 })
  if (bpAmAlert) {
    // 右端に再検マーク
    const alertNote = ws.getCell(`L${r}`)
    alertNote.note = '⚠ 血圧再検'
  }
  r++

  // PM バイタル
  ws.getRow(r).height = 20
  const bpPmStr = record?.bpSystolicPm != null
    ? `${record.bpSystolicPm}　/　${record.bpDiastolicPm ?? '?'}`
    : '　---　'

  merge(`B${r}:C${r}`, `B${r}`, '午後　13:30', { bg: C.vitalBg, fg: C.vitalFg, hAlign: 'center', size: 9 })
  merge(`E${r}:F${r}`, `E${r}`, record?.tempAfternoon != null ? String(record.tempAfternoon) : '---',
    { bg: C.white, fg: C.value, hAlign: 'center', size: 11 })
  merge(`H${r}:I${r}`, `H${r}`, bpPmStr,
    { bg: C.white, fg: C.value, hAlign: 'center', size: 11 })
  merge(`K${r}:L${r}`, `K${r}`, record?.pulsePm != null ? String(record.pulsePm) : '---',
    { bg: C.white, fg: C.value, hAlign: 'center', size: 11 })
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 6; r++

  // ━━━ 5. 食事・水分 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ 食事・水分', C.mealHdr, C.mealFg); r++

  ws.getRow(r).height = 20
  const totalFluid = (record?.fluidIntakeAm ?? 0) + (record?.fluidIntakePm ?? 0)
  lv(r, 'B', 'C', '主食', record?.mealMainFood != null ? record.mealMainFood + '割' : '---', C.mealBg, C.mealFg)
  lv(r, 'E', 'F', '副食', record?.mealSideFood != null ? record.mealSideFood + '割' : '---', C.mealBg, C.mealFg)
  lv(r, 'H', 'I', '水分 AM', record?.fluidIntakeAm != null ? record.fluidIntakeAm + 'ml' : '---', C.mealBg, C.mealFg)
  lv(r, 'K', 'L', '水分 PM', record?.fluidIntakePm != null ? record.fluidIntakePm + 'ml' : '---', C.mealBg, C.mealFg)
  r++

  ws.getRow(r).height = 18
  merge(`B${r}:C${r}`, `B${r}`, '水分合計',  { bg: C.mealBg, fg: C.mealFg, size: 8, hAlign: 'right' })
  merge(`E${r}:F${r}`, `E${r}`, totalFluid + 'ml', { bg: C.mealBg, fg: C.mealFg, bold: true, size: 10, hAlign: 'center' })
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 6; r++

  // ━━━ 6. 入浴・口腔ケア ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const bathingBg = C.subBg
  const bathingFg = C.subFg
  sectionRow(r, '■ 入浴・口腔ケア', bathingBg, bathingFg); r++

  ws.getRow(r).height = 20
  const bathing = record ? bathingLabel(record.bathing, record.bathingSkipReason) : '---'
  const bFg = record?.bathing === 'DONE' ? '065F46' : C.value  // emerald if done
  lv(r, 'B', 'C', '入浴', bathing, C.subBg, C.subFg, record?.bathing === 'DONE' ? 'ECFDF5' : C.white, bFg)
  lv(r, 'E', 'F', '口腔ケア', record?.oralCare ? '実施' : (record ? '未実施' : '---'),
    C.subBg, C.subFg, record?.oralCare ? 'ECFDF5' : C.white, record?.oralCare ? '065F46' : C.value)
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 6; r++

  // ━━━ 7. 服薬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ 服薬', C.medHdr, C.medFg); r++

  ws.getRow(r).height = 20
  const lunchMed = record?.medicationBeforeLunch || record?.medicationAfterLunch
  const medItems: [string, boolean | null | undefined][] = [
    ['朝', record?.medicationMorning],
    ['昼前', record?.medicationBeforeLunch],
    ['昼後', record?.medicationAfterLunch],
    ['夕前', record?.medicationBeforeEvening],
    ['夕後', record?.medicationEvening],
  ]
  const medSummary = medItems
    .map(([lbl, val]) => `${lbl}: ${val ? '有' : (record ? '無' : '---')}`)
    .join('　　')
  merge(`B${r}:M${r}`, `B${r}`, medSummary, {
    bg: C.medBg, fg: C.medFg, size: 10, hAlign: 'center',
  })
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 6; r++

  // ━━━ 8. 機能訓練 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ 機能訓練', C.trainHdr, C.trainFg); r++

  ws.getRow(r).height = 20
  let trainingVal = record ? (record.trainingDone ? '実施' : '未実施') : '---'
  if (record?.trainingDone && record.functionalTrainingStart) {
    trainingVal += '　' + record.functionalTrainingStart
    if (record.functionalTrainingEnd) trainingVal += '　～　' + record.functionalTrainingEnd
  }
  lv(r, 'B', 'C', '機能訓練', '', C.trainBg, C.trainFg)
  merge(`E${r}:M${r}`, `E${r}`, trainingVal, {
    bg: record?.trainingDone ? 'ECFDF5' : C.white,
    fg: record?.trainingDone ? '065F46' : C.value,
    size: 10, hAlign: 'left',
  })
  r++

  // 特記事項 (record があれば)
  if (record?.specialNotes) {
    ws.getRow(r).height = 18
    lv(r, 'B', 'C', '特記事項', '', C.trainBg, C.trainFg)
    merge(`E${r}:M${r}`, `E${r}`, record.specialNotes, { bg: C.white, fg: C.value, size: 9, hAlign: 'left' })
    r++
  }

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 8; r++

  // ━━━ 9. 日中のご様子・連絡事項 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ 日中のご様子・連絡事項', C.notesHdr, C.notesFg, 20); r++

  ws.getRow(r).height = 80
  merge(`A${r}:M${r}`, `A${r}`, aiDaily || '（記録なし）', {
    bg: C.white, fg: C.notesFg, size: 10, hAlign: 'left', vAlign: 'top', wrap: true,
    border: { top: thin, bottom: thin, left: thin, right: thin },
  })
  r++

  // ── 区切り ──────────────────────────────────────────────────────
  ws.getRow(r).height = 8; r++

  // ━━━ 10. リハビリからの連絡事項 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sectionRow(r, '■ リハビリからの連絡事項', C.notesHdr, C.notesFg, 20); r++

  ws.getRow(r).height = 50
  merge(`A${r}:M${r}`, `A${r}`, aiRehab || '（機能訓練 未実施）', {
    bg: C.white, fg: aiRehab ? C.notesFg : C.label, size: 10, hAlign: 'left', vAlign: 'top', wrap: true,
    border: { top: thin, bottom: thin, left: thin, right: thin },
  })
  r++

  // ── フッター ──────────────────────────────────────────────────────
  ws.getRow(r).height = 8; r++
  ws.getRow(r).height = 16
  merge(`A${r}:M${r}`, `A${r}`, null, { bg: C.hdrBg, fg: C.hdrFg, size: 7, border: null })
}

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? ''

  const residentIdsParam = searchParams.get('residentIds') ?? searchParams.get('residentId') ?? ''
  const residentIds = residentIdsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (!date || residentIds.length === 0) {
    return new Response('Missing date or residentIds', { status: 400 })
  }

  const [{ data: allResidents }, { data: allRecords }] = await Promise.all([
    supabase.from('Resident').select('*').in('id', residentIds),
    supabase.from('DailyRecord').select('*').in('residentId', residentIds).eq('date', date),
  ])

  const residents = (allResidents ?? []) as Resident[]
  const recordMap = new Map<string, DailyRecord>()
  for (const rec of (allRecords ?? []) as DailyRecord[]) {
    recordMap.set(rec.residentId, rec)
  }

  // AI テキスト生成（記録がある利用者のみ・並列）
  const aiTexts = new Map<string, { daily: string; rehab: string }>()
  const apiKey = process.env.GROQ_API_KEY
  if (apiKey) {
    const client = new Groq({ apiKey })
    await Promise.all(
      residents
        .filter(r => recordMap.has(r.id))
        .map(async r => {
          try {
            const texts = await generateAIText(client, r, recordMap.get(r.id)!, date)
            aiTexts.set(r.id, texts)
          } catch (err) {
            console.error('[daily-report] Groq error for', r.name, ':', err)
            aiTexts.set(r.id, { daily: '', rehab: '' })
          }
        })
    )
  }

  // ワークブック生成
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Daily Report App'
  wb.created = new Date()

  for (const residentId of residentIds) {
    const resident = residents.find(r => r.id === residentId)
    if (!resident) continue
    const record = recordMap.get(residentId) ?? null
    const ai = aiTexts.get(residentId) ?? { daily: '', rehab: '' }
    buildSheet(wb, resident, record, date, ai.daily, ai.rehab)
  }

  if (wb.worksheets.length === 0) {
    return new Response('No residents found', { status: 404 })
  }

  const buf = await wb.xlsx.writeBuffer()
  const suffix = residentIds.length === 1
    ? (residents[0]?.name ?? '利用者')
    : residentIds.length + '名'
  const filename = '連絡帳_' + suffix + '_' + date + '.xlsx'

  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
    },
  })
}
