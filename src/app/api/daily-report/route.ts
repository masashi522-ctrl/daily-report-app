import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ExcelJS from 'exceljs'
import Groq from 'groq-sdk'
import type { Resident, DailyRecord } from '@/types/database'

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']


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
      messages: [{ role: 'user', content: 'あなたはデイサービスの介護記録担当スタッフです。以下の当日記録をもとに「日中のご様子・連絡事項」欄の文章を自然な介護記録文体で３〜５文で作成してください。文章のみ出力してください。\n\n' + context }],
    }),
    record.trainingDone
      ? client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'あなたはデイサービスの機能訓練担当スタッフです。以下の訓練記録をもとに「リハビリからの連絡事項」欄の文章を自然な記録文体で１〜２文で作成してください。文章のみ出力してください。\n\n' + context }],
        })
      : Promise.resolve(null),
  ])
  return {
    daily: dailyRes.choices[0]?.message?.content ?? '',
    rehab: rehabRes?.choices[0]?.message?.content ?? '',
  }
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
      paperSize: 11,  // A5
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  const [yr, mo, dy] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const reiwa = yr - 2018
  const startTime = resident.serviceStartTime ?? ''
  const endTime = resident.serviceEndTime ?? ''
  const cat = resident.serviceTimeCategory ?? ''

  // ── 列幅（A-O 15列、A5用に調整） ───────────────────────────────
  // A:B = section/am-pm label  C = 担当者  D = spacer
  // E:G = 時間  H:J = 体温  K:M = 血圧  N:O = 脈拍
  ws.columns = [
    { width: 5   },  // A
    { width: 4   },  // B
    { width: 6   },  // C  担当者ドロップダウン
    { width: 2   },  // D  スペーサー
    { width: 4.5 },  // E
    { width: 4.5 },  // F
    { width: 4.5 },  // G
    { width: 4.5 },  // H
    { width: 4.5 },  // I
    { width: 4.5 },  // J
    { width: 5   },  // K
    { width: 4.5 },  // L
    { width: 4.5 },  // M
    { width: 5.5 },  // N
    { width: 5.5 },  // O
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
    return sc(addr, value, bg, fg, bold, size, h, v, border, wrap)
  }

  // セクションヘッダー（A-O 全幅）
  function secHdr(row: number, label: string, h2 = 18) {
    ws.getRow(row).height = h2
    mg(`A${row}:O${row}`, `A${row}`, label, COL.hdrBg, COL.hdrFg, true, 9, 'left')
  }

  let r = 1

  // ━━━ Row 1: タイトル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 22
  mg(`A${r}:O${r}`, `A${r}`, 'デイサービス　連絡帳',
    COL.titleBg, COL.titleFg, true, 12, 'center', 'middle', allB2)
  r++

  // ━━━ Row 2: 利用者名 ＋ 日付 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 18
  mg(`A${r}:G${r}`, `A${r}`, resident.name + '　様',
    COL.valBg, COL.valFg, true, 11, 'left', 'middle')
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
  ws.getRow(r).height = 15
  mg(`A${r}:F${r}`, `A${r}`, '《サービス提供時間 / 時間区分》',
    COL.lblBg, COL.lblFg, false, 7, 'left')
  mg(`G${r}:H${r}`, `G${r}`, startTime || '---', COL.valBg, COL.valFg, false, 9)
  sc(`I${r}`, '～', COL.lblBg, COL.lblFg, false, 8)
  mg(`J${r}:K${r}`, `J${r}`, endTime || '---', COL.valBg, COL.valFg, false, 9)
  sc(`L${r}`, '/', COL.lblBg, COL.lblFg, false, 8)
  mg(`M${r}:O${r}`, `M${r}`, cat ? cat + '時間' : '---', COL.valBg, COL.valFg, false, 9)
  r++

  // ━━━ Row 4: セクションタイトル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, 'デイサービスでのご様子', 15); r++

  // ━━━ Row 5: 健康チェック テーブルヘッダー ━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 14
  mg(`A${r}:B${r}`, `A${r}`, '健康チェック', COL.lblBg, COL.lblFg, true, 7)
  sc(`C${r}`, '担当者', COL.lblBg, COL.lblFg, false, 7)
  sc(`D${r}`, '',       COL.lblBg, COL.lblFg, false, 7)
  mg(`E${r}:G${r}`, `E${r}`, '時間',         COL.lblBg, COL.lblFg, false, 7)
  mg(`H${r}:J${r}`, `H${r}`, '体温（℃）',   COL.lblBg, COL.lblFg, false, 7)
  mg(`K${r}:M${r}`, `K${r}`, '血圧（mmHg）', COL.lblBg, COL.lblFg, false, 7)
  mg(`N${r}:O${r}`, `N${r}`, '脈拍（/分）',  COL.lblBg, COL.lblFg, false, 7)
  r++

  // ━━━ Row 6: AM バイタル ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const amRow = r
  ws.getRow(r).height = 17
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
  ws.getRow(r).height = 17
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
  ws.mergeCells(`C${amRow}:C${pmRow}`)
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
  ws.getRow(r).height = 20
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
  ws.getRow(r).height = 20
  mg(`A${r}:D${r}`, `A${r}`, '入　浴', COL.lblBg, COL.lblFg, true, 8)
  mg(`E${r}:H${r}`, `E${r}`,
    record ? bathingLabel(record.bathing, record.bathingSkipReason) : '',
    COL.valBg, COL.valFg, false, 10, 'left')
  mg(`I${r}:L${r}`, `I${r}`, '口腔ケア', COL.lblBg, COL.lblFg, false, 8)
  mg(`M${r}:O${r}`, `M${r}`,
    record ? (record.oralCare ? '実施' : '未実施') : '',
    COL.valBg, COL.valFg, false, 10)
  r++

  // ━━━ Row 10: 服薬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 20
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

  // ━━━ Row 11: 排便・排尿（手書き欄） ━━━━━━━━━━━━━━━━━━━━━━━━━━
  ws.getRow(r).height = 20
  mg(`A${r}:D${r}`, `A${r}`, '排便・排尿', COL.lblBg, COL.lblFg, true, 8)
  mg(`E${r}:F${r}`, `E${r}`, '排　便', COL.lblBg, COL.lblFg, false, 8)
  mg(`G${r}:H${r}`, `G${r}`, '', COL.valBg, COL.valFg, false, 10)
  mg(`I${r}:J${r}`, `I${r}`, '', COL.valBg, COL.valFg, false, 10)
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
    ws.getRow(r).height = 20
    mg(`D${r}:H${r}`, `D${r}`, item.label, COL.lblBg, COL.lblFg, false, 9, 'left')
    mg(`I${r}:J${r}`, `I${r}`, item.start, COL.valBg, COL.valFg, false, 10)
    sc(`K${r}`, item.start || item.end ? '～' : '', COL.lblBg, COL.lblFg, false, 9)
    sc(`L${r}`, '', COL.lblBg, COL.lblFg)
    mg(`M${r}:O${r}`, `M${r}`, item.end, COL.valBg, COL.valFg, false, 10)
    r++
    void i
  })
  const trainEndRow = r - 1

  // 機能訓練 A:B 縦マージ
  ws.mergeCells(`A${trainStartRow}:B${trainEndRow}`)
  const trainLblCell = ws.getCell(`A${trainStartRow}`)
  trainLblCell.value = '機能訓練'
  trainLblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(COL.lblBg) }
  trainLblCell.font = { name: FONT, size: 8, bold: true, color: ac(COL.lblFg) }
  trainLblCell.alignment = { horizontal: 'center', vertical: 'middle' }
  trainLblCell.border = allT

  // 機能訓練 担当者 C列縦マージ＋ドロップダウン
  ws.mergeCells(`C${trainStartRow}:C${trainEndRow}`)
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

  // ━━━ 日中のご様子・連絡事項 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, '日中のご様子・連絡事項', 18); r++
  ws.getRow(r).height = 90
  mg(`A${r}:O${r}`, `A${r}`, aiDaily,
    COL.valBg, COL.valFg, false, 10, 'left', 'top', allT, true)
  r++

  // ━━━ リハビリからの連絡事項 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, 'リハビリからの連絡事項', 18); r++
  ws.getRow(r).height = 60
  mg(`A${r}:O${r}`, `A${r}`, aiRehab,
    COL.valBg, aiRehab ? COL.valFg : COL.lblFg, false, 10, 'left', 'top', allT, true)
  r++

  // ━━━ 看護からの連絡事項（手書き） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, '看護からの連絡事項', 18); r++
  ws.getRow(r).height = 40
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++
  ws.getRow(r).height = 40
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++

  // ━━━ ご家族からの連絡事項（手書き） ━━━━━━━━━━━━━━━━━━━━━━━━━
  secHdr(r, 'ご家族からの連絡事項', 18); r++
  ws.getRow(r).height = 40
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg); r++
  ws.getRow(r).height = 40
  mg(`A${r}:O${r}`, `A${r}`, '', COL.valBg, COL.valFg)
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
  for (const rec of (allRecords ?? []) as DailyRecord[]) recordMap.set(rec.residentId, rec)

  const aiTexts = new Map<string, { daily: string; rehab: string }>()
  const apiKey = process.env.GROQ_API_KEY
  if (apiKey) {
    const client = new Groq({ apiKey })
    await Promise.all(
      residents
        .filter(rr => recordMap.has(rr.id))
        .map(async rr => {
          try {
            aiTexts.set(rr.id, await generateAIText(client, rr, recordMap.get(rr.id)!, date))
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
