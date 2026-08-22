import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ExcelJS from 'exceljs'
import type { Resident, DailyRecord } from '@/types/database'
// 文章とラベルの決まりごとは、LINEで送る画像と共通のものを使う
import { DOW_JA, bathingLabel, sheetSafeName, generateAIText, createGroqClient } from '@/lib/daily-report-ai'
import { serviceTimeRangeFromNotes } from '@/lib/attendance-stats'

// 印刷の倍率（%）。Excelに計算させるとプリンターによって変わるため固定する。
// 内容は888×660pt。79%で702×521ptとなり、余白が0.5インチ必要な機種でも
// A4横1枚に収まる
const PRINT_SCALE = 79

// AI文章欄（A〜O列を結合）の横幅。何文字で折り返すかの見積もりに使う
const AI_TEXT_WIDTH_UNITS = 69

// 文章欄と手書き欄に配れる高さの合計（pt）。
// 合計を固定したまま中の配分だけを変えることで、文章が短い日は
// その分を手書き欄に回しつつ、印刷の大きさは一定に保つ
const SECTION_BUDGET = 322
/** 文章欄の上限。これを超える文章は文字を小さくして収める */
const AI_DAILY_MAX = 160
const AI_REHAB_MAX = 82
/** 文章が無いときの最小の高さ */
const AI_DAILY_MIN = 44
const AI_REHAB_MIN = 30
/** 手書き欄（看護・ご家族の各2行） */
const BLANK_ROWS = 4
const BLANK_ROW_MIN = 20

/** 指定した文字の大きさで、その文章が何行になるか */
function countLines(text: string, size: number): number {
  const body = text.trim()
  if (!body) return 0
  const charsPerLine = Math.max(5, Math.floor(AI_TEXT_WIDTH_UNITS * 0.42 * (10 / size)))
  return body.split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)), 0)
}

/**
 * 文章欄の文字の大きさと高さを決める。
 * 文字は大きい方から順に試し、上限の高さに収まる最初のものを使う。
 * 高さは文章の行数ぴったりにして、余白が空きすぎないようにする。
 */
function fitTextBox(text: string, maxHeight: number, minHeight: number) {
  const body = (text ?? '').trim()
  if (!body) return { size: 10, height: minHeight }

  for (const size of [10, 9, 8, 7, 6]) {
    const height = Math.ceil(countLines(body, size) * size * 1.7 + 8)
    if (height <= maxHeight) return { size, height: Math.max(minHeight, height) }
  }
  return { size: 6, height: maxHeight }
}

/**
 * 文章欄と手書き欄の高さを配分する。合計は必ず SECTION_BUDGET になる。
 * 文章が短い日は、余った高さを手書き欄に回す。
 */
function layoutSections(aiDaily: string, aiRehab: string) {
  const daily = fitTextBox(aiDaily, AI_DAILY_MAX, AI_DAILY_MIN)
  const rehab = fitTextBox(aiRehab, AI_REHAB_MAX, AI_REHAB_MIN)

  // 残りを手書き欄に均等に配り、端数は最後の行で吸収して合計を合わせる
  const rest = SECTION_BUDGET - daily.height - rehab.height
  const each = Math.max(BLANK_ROW_MIN, Math.floor(rest / BLANK_ROWS))
  const blanks = Array.from({ length: BLANK_ROWS }, () => each)
  blanks[BLANK_ROWS - 1] += rest - each * BLANK_ROWS

  return { daily, rehab, blanks }
}


// ─── カラー（2色：タイトルのみティール、他グレー） ────────────────
const COL = {
  titleBg:  '0F766E',
  titleFg:  'FFFFFF',
  hdrBg:    'E5E7EB',  // section header (gray-200)
  hdrFg:    '1F2937',
  lblBg:    'F3F4F6',  // label cell (gray-100)
  lblFg:    '374151',
  valBg:    'FFFFFF',
  valFg:    '111827',
  alertBg:  'FEE2E2',
  alertFg:  'B91C1C',
  border:   'D1D5DB',
}
const FONT = 'メイリオ'

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
      paperSize: 9,  // A4
      orientation: 'landscape',
      // A4横（297mm）にA5縦（148mm）がちょうど2枚並ぶ。左右に同じ内容を出し、
      // 真ん中で切ればA5の連絡帳が2部になる。
      //
      // 「1ページに収める」設定にすると、Excelがプリンターの印刷可能範囲を
      // 見て倍率を計算するため、PCによって大きさが変わってしまう。
      // ここでは倍率を固定し、どのPCでも同じ大きさで印刷されるようにする。
      // 79%は、余白が0.5インチ必要な機種でも1枚に収まる値。
      fitToPage: false,
      scale: PRINT_SCALE,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
      horizontalCentered: true,
      verticalCentered: true,
    },
  })

  const [yr, mo, dy] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const reiwa = yr - 2018
  // その日だけ利用時間が変わったときは、特記事項の記載を優先する
  const changed = serviceTimeRangeFromNotes(record?.specialNotes)
  const startTime = changed?.start ?? resident.serviceStartTime ?? ''
  const endTime = changed?.end ?? resident.serviceEndTime ?? ''
  const cat = changed ? '' : (resident.serviceTimeCategory ?? '')

  // ── 列幅（A-O 15列、A5用に調整） ───────────────────────────────
  // A:B = section/am-pm label  C = 担当者  D = spacer
  // E:G = 時間  H:J = 体温  K:M = 血圧  N:O = 脈拍
  // 高さが先に上限に達して幅が余っていたため、列を広げて紙の幅も使い切る
  ws.columns = [
    { width: 5.8 },  // A
    { width: 4.6 },  // B
    { width: 6.9 },  // C  担当者ドロップダウン
    { width: 2.3 },  // D  スペーサー
    { width: 5.2 },  // E
    { width: 5.2 },  // F
    { width: 5.2 },  // G
    { width: 5.2 },  // H
    { width: 5.2 },  // I
    { width: 5.2 },  // J
    { width: 5.8 },  // K
    { width: 5.2 },  // L
    { width: 5.2 },  // M
    { width: 6.3 },  // N
    { width: 6.3 },  // O
  ]

  // ── ヘルパー ────────────────────────────────────────────────────
  type BS = { style: ExcelJS.BorderStyle; color: { argb: string } }
  const ac = (hex: string) => ({ argb: 'FF' + hex })
  const thin:   BS = { style: 'thin',   color: ac(COL.border) }
  const bold2:  BS = { style: 'medium', color: ac(COL.titleBg) }
  const allT  = { top: thin, bottom: thin, left: thin, right: thin }
  const allB2 = { top: bold2, bottom: bold2, left: bold2, right: bold2 }

  type BorderSpec = { top?: BS; bottom?: BS; left?: BS; right?: BS } | null
  type HAlign = ExcelJS.Alignment['horizontal']
  type VAlign = ExcelJS.Alignment['vertical']

  function sc(
    addr: string,
    value: string | number | null,
    bg = COL.valBg, fg = COL.valFg,
    bold = false, size = 9,
    h: HAlign = 'center', v: VAlign = 'middle',
    border: BorderSpec = allT,
    wrap = false,
  ) {
    const cell = ws.getCell(addr)
    if (value !== null) cell.value = value
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(bg) }
    cell.font  = { name: FONT, size, bold, color: ac(fg) }
    cell.alignment = { horizontal: h, vertical: v, wrapText: wrap }
    if (border) cell.border = border
    return cell
  }

  // 右半分へ複製するために、結合した範囲を控えておく
  const mergedRanges: string[] = []

  function mg(
    range: string, addr: string,
    value: string | number | null,
    bg = COL.valBg, fg = COL.valFg,
    bold = false, size = 9,
    h: HAlign = 'center', v: VAlign = 'middle',
    border: BorderSpec = allT,
    wrap = false,
  ) {
    ws.mergeCells(range)
    mergedRanges.push(range)
    return sc(addr, value, bg, fg, bold, size, h, v, border, wrap)
  }

  // ExcelJSが書き出した行の高さは、Excel上では指定値の約2/3で表示される。
  // 詰まって見えるのを防ぐため、指定するときに打ち消しておく
  const H = (points: number) => points * 1.5

  // セクションヘッダー（A-O 全幅）
  function secHdr(row: number, label: string, h2 = 18, h: HAlign = 'center') {
    ws.getRow(row).height = H(h2)
    mg(`A${row}:O${row}`, `A${row}`, label, COL.hdrBg, COL.hdrFg, true, 9, h)
  }

  let r = 1

  // ━━━ Row 1: タイトル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(22)
  mg(`A${r}:O${r}`, `A${r}`, 'デイサービス　連絡帳',
    COL.titleBg, COL.titleFg, true, 12, 'center', 'middle', allB2)
  r++

  // ━━━ Row 2: 利用者名 ＋ 日付 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 氏名は誰の連絡帳か一目で分かるよう大きめに（余白が窮屈にならない高さに合わせる）
  ws.getRow(r).height = H(26)
  mg(`A${r}:G${r}`, `A${r}`, resident.name + '　様',
    COL.valBg, COL.valFg, true, 16, 'center', 'middle')
  sc(`H${r}`, 'R',     COL.lblBg, COL.lblFg, false, 8)
  sc(`I${r}`, reiwa,   COL.valBg, COL.valFg, false, 9)
  sc(`J${r}`, '年',    COL.lblBg, COL.lblFg, false, 8)
  sc(`K${r}`, mo,      COL.valBg, COL.valFg, false, 9)
  sc(`L${r}`, '月',    COL.lblBg, COL.lblFg, false, 8)
  sc(`M${r}`, dy,      COL.valBg, COL.valFg, false, 9)
  sc(`N${r}`, '日',    COL.lblBg, COL.lblFg, false, 8)
  sc(`O${r}`, DOW_JA[dow] + '曜日', COL.valBg, COL.valFg, false, 8)
  r++

  // ━━━ Row 3: サービス提供時間 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(15)
  mg(`A${r}:F${r}`, `A${r}`, changed ? '《サービス提供時間（本日変更）》' : '《サービス提供時間 / 時間区分》',
    COL.lblBg, COL.lblFg, false, 8, 'center')
  mg(`G${r}:H${r}`, `G${r}`, startTime || '---', COL.valBg, COL.valFg, false, 9)
  sc(`I${r}`, '～', COL.lblBg, COL.lblFg, false, 8)
  mg(`J${r}:K${r}`, `J${r}`, endTime || '---', COL.valBg, COL.valFg, false, 9)
  sc(`L${r}`, '/', COL.lblBg, COL.lblFg, false, 8)
  mg(`M${r}:O${r}`, `M${r}`, cat ? cat + '時間' : '---', COL.valBg, COL.valFg, false, 9)
  r++

  // ━━━ Row 4: セクションタイトル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, 'デイサービスでのご様子', 15); r++

  // ━━━ Row 5: 健康チェック テーブルヘッダー ━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(14)
  mg(`A${r}:B${r}`, `A${r}`, '健康チェック', COL.lblBg, COL.lblFg, true, 8)
  sc(`C${r}`, '担当者', COL.lblBg, COL.lblFg, false, 8)
  sc(`D${r}`, '',       COL.lblBg, COL.lblFg, false, 8)
  mg(`E${r}:G${r}`, `E${r}`, '時間',         COL.lblBg, COL.lblFg, false, 8)
  mg(`H${r}:J${r}`, `H${r}`, '体温（℃）',   COL.lblBg, COL.lblFg, false, 8)
  mg(`K${r}:M${r}`, `K${r}`, '血圧（mmHg）', COL.lblBg, COL.lblFg, false, 8)
  mg(`N${r}:O${r}`, `N${r}`, '脈拍（/分）',  COL.lblBg, COL.lblFg, false, 8)
  r++

  // ━━━ Row 6: AM バイタル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const amRow = r
  ws.getRow(r).height = H(17)
  mg(`A${r}:B${r}`, `A${r}`, '午前', COL.lblBg, COL.lblFg, false, 8)
  sc(`D${r}`, '', COL.valBg, COL.valFg)
  const bpAmAlert = record != null &&
    ((record.bpSystolic ?? 0) >= 160 || (record.bpDiastolic ?? 0) >= 90)
  const bpAmStr = record?.bpSystolic != null
    ? `${record.bpSystolic} / ${record.bpDiastolic ?? '?'}`
    : ''
  mg(`E${r}:G${r}`, `E${r}`, '9:30',   COL.valBg, COL.lblFg, false, 9)
  mg(`H${r}:J${r}`, `H${r}`,
    record?.tempMorning != null ? String(record.tempMorning) : '',
    COL.valBg, COL.valFg, false, 10)
  mg(`K${r}:M${r}`, `K${r}`, bpAmStr,
    bpAmAlert ? COL.alertBg : COL.valBg,
    bpAmAlert ? COL.alertFg : COL.valFg,
    bpAmAlert, 10)
  mg(`N${r}:O${r}`, `N${r}`,
    record?.pulse != null ? String(record.pulse) : '',
    COL.valBg, COL.valFg, false, 10)
  r++

  // ━━━ Row 7: PM バイタル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pmRow = r
  ws.getRow(r).height = H(17)
  mg(`A${r}:B${r}`, `A${r}`, '午後', COL.lblBg, COL.lblFg, false, 8)
  sc(`D${r}`, '', COL.valBg, COL.valFg)
  const bpPmStr = record?.bpSystolicPm != null
    ? `${record.bpSystolicPm} / ${record.bpDiastolicPm ?? '?'}`
    : ''
  mg(`E${r}:G${r}`, `E${r}`, '13:30', COL.valBg, COL.lblFg, false, 9)
  mg(`H${r}:J${r}`, `H${r}`,
    record?.tempAfternoon != null ? String(record.tempAfternoon) : '',
    COL.valBg, COL.valFg, false, 10)
  mg(`K${r}:M${r}`, `K${r}`, bpPmStr, COL.valBg, COL.valFg, false, 10)
  mg(`N${r}:O${r}`, `N${r}`,
    record?.pulsePm != null ? String(record.pulsePm) : '',
    COL.valBg, COL.valFg, false, 10)
  r++

  // 健康チェック 担当者: AM-PM 行の C列を縦マージしてドロップダウン
  ws.mergeCells(`C${amRow}:C${pmRow}`); mergedRanges.push(`C${amRow}:C${pmRow}`)
  const vitalsStaffCell = ws.getCell(`C${amRow}`)
  vitalsStaffCell.value = ''
  vitalsStaffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(COL.valBg) }
  vitalsStaffCell.font = { name: FONT, size: 10, color: ac(COL.valFg) }
  vitalsStaffCell.alignment = { horizontal: 'center', vertical: 'middle' }
  vitalsStaffCell.border = allT
  vitalsStaffCell.dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"屋島,上野,尾崎"'],
    showErrorMessage: false,
  }

  // ━━━ Row 8: 食事・水分量 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(20)
  mg(`A${r}:D${r}`, `A${r}`, '食事・水分量', COL.lblBg, COL.lblFg, true, 8)
  mg(`E${r}:F${r}`, `E${r}`, '（主食）',     COL.lblBg, COL.lblFg, false, 8)
  sc(`G${r}`, record?.mealMainFood != null ? record.mealMainFood + '割' : '',
    COL.valBg, COL.valFg, false, 11)
  mg(`H${r}:I${r}`, `H${r}`, '（副食）',     COL.lblBg, COL.lblFg, false, 8)
  sc(`J${r}`, record?.mealSideFood != null ? record.mealSideFood + '割' : '',
    COL.valBg, COL.valFg, false, 11)
  mg(`K${r}:L${r}`, `K${r}`, '（水分量）',   COL.lblBg, COL.lblFg, false, 8)
  sc(`M${r}`, '約', COL.lblBg, COL.lblFg, false, 8)
  mg(`N${r}:O${r}`, `N${r}`,
    (() => { const t = (record?.fluidIntakeAm ?? 0) + (record?.fluidIntakePm ?? 0); return t > 0 ? t + 'ml' : '' })(),
    COL.valBg, COL.valFg, false, 11)
  r++

  // ━━━ Row 9: 入浴・口腔ケア ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(20)
  mg(`A${r}:D${r}`, `A${r}`, '入　浴', COL.lblBg, COL.lblFg, true, 8)
  mg(`E${r}:H${r}`, `E${r}`,
    record ? bathingLabel(record.bathing, record.bathingSkipReason) : '',
    COL.valBg, COL.valFg, false, 10)
  mg(`I${r}:L${r}`, `I${r}`, '口腔ケア', COL.lblBg, COL.lblFg, false, 8)
  mg(`M${r}:O${r}`, `M${r}`,
    record ? (record.oralCare ? '実施' : '未実施') : '',
    COL.valBg, COL.valFg, false, 10)
  r++

  // ━━━ Row 10: 服薬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(20)
  const lunchMed = record?.medicationBeforeLunch || record?.medicationAfterLunch
  mg(`A${r}:D${r}`, `A${r}`, '服　薬', COL.lblBg, COL.lblFg, true, 8)
  sc(`E${r}`, '（朝）', COL.lblBg, COL.lblFg, false, 8)
  mg(`F${r}:G${r}`, `F${r}`,
    record ? (record.medicationMorning ? '有' : '無') : '',
    COL.valBg, COL.valFg, false, 10)
  sc(`H${r}`, '（昼）', COL.lblBg, COL.lblFg, false, 8)
  mg(`I${r}:J${r}`, `I${r}`,
    record ? (lunchMed ? '有' : '無') : '',
    COL.valBg, COL.valFg, false, 10)
  sc(`K${r}`, '（夕）', COL.lblBg, COL.lblFg, false, 8)
  mg(`L${r}:O${r}`, `L${r}`,
    record ? (record.medicationEvening ? '有' : '無') : '',
    COL.valBg, COL.valFg, false, 10)
  r++

  // ━━━ Row 11: 排便・排尿（排尿は手書き欄） ━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = H(20)
  mg(`A${r}:D${r}`, `A${r}`, '排便・排尿', COL.lblBg, COL.lblFg, true, 8)
  mg(`E${r}:F${r}`, `E${r}`, '排　便', COL.lblBg, COL.lblFg, false, 8)
  // 日次記録の排便（量・質）を差し込む。未記録なら手書きできるよう空欄のまま
  mg(`G${r}:H${r}`, `G${r}`, record?.bowelAmount ?? '', COL.valBg, COL.valFg, false, 10)
  mg(`I${r}:J${r}`, `I${r}`, record?.bowelQuality ?? '', COL.valBg, COL.valFg, false, 10)
  mg(`K${r}:L${r}`, `K${r}`, '排　尿', COL.lblBg, COL.lblFg, false, 8)
  mg(`M${r}:O${r}`, `M${r}`, '', COL.valBg, COL.valFg, false, 10)
  r++

  // ━━━ Row 12-14: 機能訓練（3行） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const trainStartRow = r
  const trainItems = [
    { label: '上下肢・体幹運動',
      start: record?.trainingDone ? (record.functionalTrainingStart ?? '') : '',
      end:   record?.trainingDone ? (record.functionalTrainingEnd   ?? '') : '' },
    { label: '歩行訓練',    start: '', end: '' },
    { label: '認知機能訓練', start: '', end: '' },
  ]
  trainItems.forEach((item, i) => {
    ws.getRow(r).height = H(20)
    mg(`D${r}:H${r}`, `D${r}`, item.label, COL.lblBg, COL.lblFg, false, 9)
    mg(`I${r}:J${r}`, `I${r}`, item.start, COL.valBg, COL.valFg, false, 10)
    sc(`K${r}`, item.start || item.end ? '～' : '', COL.lblBg, COL.lblFg, false, 9)
    sc(`L${r}`, '', COL.lblBg, COL.lblFg)
    mg(`M${r}:O${r}`, `M${r}`, item.end, COL.valBg, COL.valFg, false, 10)
    r++
    void i
  })
  const trainEndRow = r - 1

  // 機能訓練 A:B 縦マージ
  ws.mergeCells(`A${trainStartRow}:B${trainEndRow}`); mergedRanges.push(`A${trainStartRow}:B${trainEndRow}`)
  const trainLblCell = ws.getCell(`A${trainStartRow}`)
  trainLblCell.value = '機能訓練'
  trainLblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(COL.lblBg) }
  trainLblCell.font = { name: FONT, size: 8, bold: true, color: ac(COL.lblFg) }
  trainLblCell.alignment = { horizontal: 'center', vertical: 'middle' }
  trainLblCell.border = allT

  // 機能訓練 担当者 C列縦マージ＋ドロップダウン
  ws.mergeCells(`C${trainStartRow}:C${trainEndRow}`); mergedRanges.push(`C${trainStartRow}:C${trainEndRow}`)
  const trainStaffCell = ws.getCell(`C${trainStartRow}`)
  trainStaffCell.value = ''
  trainStaffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(COL.valBg) }
  trainStaffCell.font = { name: FONT, size: 10, color: ac(COL.valFg) }
  trainStaffCell.alignment = { horizontal: 'center', vertical: 'middle' }
  trainStaffCell.border = allT
  trainStaffCell.dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"山根,奥田,屋島,尾崎"'],
    showErrorMessage: false,
  }

  // ━━━ 文章欄と手書き欄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 文章欄は中身の行数ぴったりの高さにし、余った分は手書き欄へ回す。
  // 合計の高さは変わらないため、文章の長さで印刷の大きさが変わらない
  const layout = layoutSections(aiDaily, aiRehab)

  secHdr(r, '日中のご様子・連絡事項', 18); r++
  ws.getRow(r).height = H(layout.daily.height)
  mg(`A${r}:O${r}`, `A${r}`, aiDaily,
    COL.valBg, COL.valFg, false, layout.daily.size, 'left', 'top', allT, true)
  r++

  secHdr(r, 'リハビリからの連絡事項', 18, 'left'); r++
  ws.getRow(r).height = H(layout.rehab.height)
  mg(`A${r}:O${r}`, `A${r}`, aiRehab,
    COL.valBg, aiRehab ? COL.valFg : COL.lblFg, false, layout.rehab.size, 'left', 'top', allT, true)
  r++

  // ━━━ 看護からの連絡事項（手書き） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, '看護からの連絡事項', 18, 'left'); r++
  ws.getRow(r).height = H(layout.blanks[0])
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++
  ws.getRow(r).height = H(layout.blanks[1])
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++

  // ━━━ ご家族からの連絡事項（手書き） ━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, 'ご家族からの連絡事項', 18, 'left'); r++
  ws.getRow(r).height = H(layout.blanks[2])
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++
  ws.getRow(r).height = H(layout.blanks[3])
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg)

  duplicateToRight(ws, r, mergedRanges)
}

/** 左半分の列数（A〜O の15列） */
const BLOCK_COLS = 15
/** 左右の間に入れる区切り列の幅。ここで切り分ける */
const GUTTER_WIDTH = 2.5
/** 右半分は区切り列の分も含めてずらす */
const COL_OFFSET = BLOCK_COLS + 1

function colName(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * 左半分（A〜O）に組み立てた連絡帳を、そのまま右半分（P〜AD）へ複製する。
 * A4横1枚に同じ内容が2部並び、真ん中で切ればA5の連絡帳が2部になる。
 */
function duplicateToRight(ws: ExcelJS.Worksheet, lastRow: number, mergedRanges: string[]) {
  // 列幅（区切り列 → 右半分）
  ws.getColumn(BLOCK_COLS + 1).width = GUTTER_WIDTH
  for (let c = 1; c <= BLOCK_COLS; c++) {
    ws.getColumn(c + COL_OFFSET).width = ws.getColumn(c).width
  }

  // 区切り列は罫線も色も付けず、切り取り位置が分かるようにする
  for (let row = 1; row <= lastRow; row++) {
    const cell = ws.getCell(row, BLOCK_COLS + 1)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    cell.border = {}
  }

  // 先に結合してから値を入れる。逆にすると、結合で消えるセルに書いた値が
  // 先頭セルを上書きしてしまう
  const slaves = new Set<string>()
  for (const range of mergedRanges) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
    if (!m) continue
    const toNum = (letters: string) =>
      letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0)
    const c1 = toNum(m[1]) + COL_OFFSET
    const c2 = toNum(m[3]) + COL_OFFSET
    const r1 = Number(m[2])
    const r2 = Number(m[4])
    ws.mergeCells(`${colName(c1)}${r1}:${colName(c2)}${r2}`)
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue
        slaves.add(`${r}:${c}`)
      }
    }
  }

  // 書式は結合に隠れるセルにも入れる（罫線や背景は隠れたセル側にも
  // 持たせないと、結合範囲の内側で線が欠けてずれて見える）。
  //
  // 値は左側を参照する数式にする。ダウンロード後に左側へ書き込むと
  // 右側にも自動で反映される。空欄をそのまま参照すると Excel は 0 と
  // 表示するため、IF で空欄のまま返す。
  // 数式は先頭セルだけに入れる（隠れたセルへ書くと先頭を上書きしてしまう）
  for (let row = 1; row <= lastRow; row++) {
    for (let c = 1; c <= BLOCK_COLS; c++) {
      const dstCol = c + COL_OFFSET
      const src = ws.getCell(row, c)
      const dst = ws.getCell(row, dstCol)
      dst.style = { ...src.style }
      if (slaves.has(`${row}:${dstCol}`)) continue

      const ref = `${colName(c)}${row}`
      // 計算前でも中身が見えるよう、今の値を計算結果として持たせておく
      const current = src.value
      const result = current == null || typeof current === 'object' ? '' : current
      dst.value = { formula: `IF(${ref}="","",${ref})`, result }

      // 担当者欄のプルダウンも引き継ぐ。ふだんは左側の内容が写るが、
      // 右側だけ別の担当者にしたいときは選び直せるようにしておく
      if (src.dataValidation) dst.dataValidation = { ...src.dataValidation }
    }
  }
}

export async function GET(request: Request) {
  const session = await requireSession()

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? ''
  const residentIdsParam = searchParams.get('residentIds') ?? searchParams.get('residentId') ?? ''
  const residentIds = residentIdsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (!date || residentIds.length === 0) {
    return new Response('Missing date or residentIds', { status: 400 })
  }

  const [{ data: allResidents }, { data: allRecords }] = await Promise.all([
    supabase.from('Resident').select('*').in('id', residentIds).eq('facilityId', session.facilityId),
    supabase.from('DailyRecord').select('*').in('residentId', residentIds).eq('date', date),
  ])

  const residents = (allResidents ?? []) as Resident[]
  const recordMap = new Map<string, DailyRecord>()
  for (const rec of (allRecords ?? []) as DailyRecord[]) recordMap.set(rec.residentId, rec)

  const aiTexts = new Map<string, { daily: string; rehab: string }>()
  const groq = await createGroqClient()
  if (groq) {
    const { client, model } = groq
    await Promise.all(
      residents
        .filter(rr => recordMap.has(rr.id))
        .map(async rr => {
          try {
            aiTexts.set(rr.id, await generateAIText(client, model, rr, recordMap.get(rr.id)!, date))
          } catch (err) {
            console.error('[daily-report] Groq error for', rr.name, ':', err)
            aiTexts.set(rr.id, { daily: '', rehab: '' })
          }
        })
    )
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Daily Report App'
  wb.created = new Date()

  for (const residentId of residentIds) {
    const resident = residents.find(rr => rr.id === residentId)
    if (!resident) continue
    const record = recordMap.get(residentId) ?? null
    const ai = aiTexts.get(residentId) ?? { daily: '', rehab: '' }
    buildSheet(wb, resident, record, date, ai.daily, ai.rehab)
  }

  if (wb.worksheets.length === 0) return new Response('No residents found', { status: 404 })

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
