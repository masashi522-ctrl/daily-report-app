import ExcelJS from 'exceljs'
import type { TrainingPlan, TrainingPlanGoal } from '@/types/database'

function jaDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}年${m}月${day}日`
}

function sheetSafeName(name: string): string {
  return name.replace(/[:\\/?[\]*]/g, '').slice(0, 31)
}

// ─── Excel ──────────────────────────────────────────────────────────
const COL = {
  titleBg: '0F766E',
  titleFg: 'FFFFFF',
  hdrBg:   'E5E7EB',
  hdrFg:   '1F2937',
  lblBg:   'F3F4F6',
  lblFg:   '374151',
  valBg:   'FFFFFF',
  valFg:   '111827',
  border:  'D1D5DB',
}
const FONT = 'メイリオ'

// A〜H列の幅（Excel単位）。文章量に応じた行の高さ計算にも使う。
const COLUMN_WIDTHS = [14, 12, 12, 12, 12, 10, 10, 10]

function widthUnits(fromCol: number, toCol: number): number {
  let sum = 0
  for (let c = fromCol; c <= toCol; c++) sum += COLUMN_WIDTHS[c - 1] ?? 10
  return sum
}

// 列幅から、折り返し後に文章が切れないための行の高さ(pt)を見積もる
// 全角文字を想定し、余裕を持たせて安全側（高さ多め）に倒す
function estimateTextHeight(text: string | null | undefined, units: number, fontSize: number, minHeight: number): number {
  const t = (text ?? '').trim()
  if (!t) return minHeight
  const charsPerLine = Math.max(5, Math.floor(units * 0.42))
  const lines = t.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)), 0)
  const lineHeight = fontSize * 1.7
  return Math.max(minHeight, Math.ceil(lines * lineHeight + 10))
}

export function buildTrainingPlanExcel(
  resident: { name: string },
  facilityName: string,
  plan: TrainingPlan,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Daily Report App'
  wb.created = new Date()

  const ws = wb.addWorksheet(sheetSafeName(resident.name), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  ws.columns = COLUMN_WIDTHS.map(width => ({ width }))
  const LAST_COL = 'H'

  const ac = (hex: string) => ({ argb: 'FF' + hex })
  type BS = { style: ExcelJS.BorderStyle; color: { argb: string } }
  const thin: BS = { style: 'thin', color: ac(COL.border) }
  const allT = { top: thin, bottom: thin, left: thin, right: thin }

  type HAlign = ExcelJS.Alignment['horizontal']
  type VAlign = ExcelJS.Alignment['vertical']

  function sc(addr: string, value: string | number | null, opts: {
    bg?: string; fg?: string; bold?: boolean; size?: number
    h?: HAlign; v?: VAlign; wrap?: boolean
  } = {}) {
    const { bg = COL.valBg, fg = COL.valFg, bold = false, size = 10, h = 'left', v = 'middle', wrap = false } = opts
    const cell = ws.getCell(addr)
    if (value !== null) cell.value = value
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: ac(bg) }
    cell.font = { name: FONT, size, bold, color: ac(fg) }
    cell.alignment = { horizontal: h, vertical: v, wrapText: wrap }
    cell.border = allT
    return cell
  }

  function mg(range: string, addr: string, value: string | number | null, opts?: Parameters<typeof sc>[2]) {
    ws.mergeCells(range)
    return sc(addr, value, opts)
  }

  function secHdr(row: number, label: string, height = 18) {
    ws.getRow(row).height = height
    mg(`A${row}:${LAST_COL}${row}`, `A${row}`, label, { bg: COL.hdrBg, fg: COL.hdrFg, bold: true, size: 10 })
  }

  function labelRow(row: number, cells: [string, number, string, number][], height = 18) {
    // cells: [label, labelColSpan, value, valueColSpan] laid out left-to-right starting at column A
    ws.getRow(row).height = height
    let col = 1
    for (const [label, lspan, value, vspan] of cells) {
      const lStart = colLetter(col)
      const lEnd = colLetter(col + lspan - 1)
      if (lspan > 1) mg(`${lStart}${row}:${lEnd}${row}`, `${lStart}${row}`, label, { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
      else sc(`${lStart}${row}`, label, { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
      col += lspan
      const vStart = colLetter(col)
      const vEnd = colLetter(col + vspan - 1)
      if (vspan > 1) mg(`${vStart}${row}:${vEnd}${row}`, `${vStart}${row}`, value, { size: 9 })
      else sc(`${vStart}${row}`, value, { size: 9 })
      col += vspan
    }
  }

  function colLetter(n: number): string {
    return String.fromCharCode(64 + n)
  }

  let r = 1

  ws.getRow(r).height = 26
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '個別機能訓練計画書',
    { bg: COL.titleBg, fg: COL.titleFg, bold: true, size: 15, h: 'center' })
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:D${r}`, `A${r}`, `作成年月日：${jaDate(plan.planDate)}`, { size: 9, fg: COL.lblFg })
  mg(`E${r}:F${r}`, `E${r}`, `作成者：${plan.staffName ?? ''}`, { size: 9, fg: COL.lblFg })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, `第${plan.version ?? 1}版`, { size: 9, fg: COL.lblFg, h: 'right' })
  r++

  labelRow(r, [
    ['前回作成日', 2, jaDate(plan.previousPlanDate), 2],
    ['初回作成日', 2, jaDate(plan.firstPlanDate), 2],
  ])
  r++

  labelRow(r, [
    ['氏名', 1, `${resident.name} 様`, 3],
    ['性別', 1, plan.gender ?? '', 3],
  ])
  r++

  labelRow(r, [
    ['要介護度', 2, plan.careLevel ?? '', 2],
    ['生年月日', 2, jaDate(plan.birthDate), 2],
  ])
  r++

  labelRow(r, [
    ['障害高齢者の日常生活自立度', 3, plan.adlIndependenceLevel ?? '', 1],
    ['認知症高齢者の日常生活自立度', 3, plan.dementiaIndependenceLevel ?? '', 1],
  ])
  r++
  r++

  const textSections: [string, string | null][] = [
    ['【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】', plan.needsAnalysis],
    ['【総合的な援助の方針】', plan.supportPolicy],
    ['【ゴールのイメージ】', plan.goalImage],
    ['【社会参加の状況】', plan.socialParticipation],
    ['【家屋の状況】', plan.housingSituation],
  ]
  for (const [label, text] of textSections) {
    secHdr(r, label); r++
    ws.getRow(r).height = estimateTextHeight(text, widthUnits(1, 8), 10, 24)
    mg(`A${r}:${LAST_COL}${r}`, `A${r}`, text ?? '', { size: 10, v: 'top', wrap: true })
    r++
  }

  secHdr(r, '【リハビリ目標】'); r++
  ws.getRow(r).height = 24
  mg(`A${r}:B${r}`, `A${r}`, '解決すべき課題（ニーズ）', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center', wrap: true })
  sc(`C${r}`, '長期目標\n（機能・活動・参加）', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center', wrap: true })
  mg(`D${r}:E${r}`, `D${r}`, '短期目標\n（機能・活動・参加・3か月）', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center', wrap: true })
  mg(`F${r}:G${r}`, `F${r}`, 'サービス内容', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`H${r}`, '頻度', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  r++

  const goals: TrainingPlanGoal[] = plan.goals && plan.goals.length > 0 ? plan.goals : [
    { issue: '', longTermGoal: '', shortTermGoal: '', serviceContent: '', frequency: '' },
  ]
  for (const g of goals) {
    ws.getRow(r).height = Math.max(
      estimateTextHeight(g.issue, widthUnits(1, 2), 9, 20),
      estimateTextHeight(g.longTermGoal, widthUnits(3, 3), 9, 20),
      estimateTextHeight(g.shortTermGoal, widthUnits(4, 5), 9, 20),
      estimateTextHeight(g.serviceContent, widthUnits(6, 7), 9, 20),
      estimateTextHeight(g.frequency, widthUnits(8, 8), 9, 20),
    )
    mg(`A${r}:B${r}`, `A${r}`, g.issue, { size: 9, v: 'top', wrap: true })
    sc(`C${r}`, g.longTermGoal, { size: 9, v: 'top', wrap: true })
    mg(`D${r}:E${r}`, `D${r}`, g.shortTermGoal, { size: 9, v: 'top', wrap: true })
    mg(`F${r}:G${r}`, `F${r}`, g.serviceContent, { size: 9, v: 'top', wrap: true })
    sc(`H${r}`, g.frequency, { size: 9, v: 'top', wrap: true })
    r++
  }
  r++

  secHdr(r, '【健康状態・経過】'); r++
  labelRow(r, [
    ['病名', 2, plan.diseaseName ?? '', 6],
  ])
  r++
  labelRow(r, [
    ['発症・受傷日', 2, jaDate(plan.onsetDate), 2],
    ['直近の入院日', 2, jaDate(plan.recentAdmissionDate), 2],
  ])
  r++
  labelRow(r, [
    ['直近の退院日', 2, jaDate(plan.recentDischargeDate), 6],
  ])
  r++
  r++

  secHdr(r, '【機能訓練実施上の留意事項（運動強度・負荷量等）】'); r++
  ws.getRow(r).height = estimateTextHeight(plan.trainingPrecautions, widthUnits(1, 8), 10, 24)
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, plan.trainingPrecautions ?? '', { size: 10, v: 'top', wrap: true })
  r++
  r++

  secHdr(r, '【リハビリ達成状況】'); r++
  labelRow(r, [
    ['モニタリング日', 2, jaDate(plan.monitoringDate), 2],
    ['期間', 2, plan.monitoringPeriod ?? '', 2],
  ])
  r++
  ws.getRow(r).height = estimateTextHeight(plan.monitoringContent, widthUnits(1, 8), 10, 24)
  mg(`A${r}:B${r}`, `A${r}`, '内容', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, plan.monitoringContent ?? '', { size: 9, v: 'top', wrap: true })
  r++
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記の個別機能訓練計画によりサービス提供を行います。', { size: 9, v: 'top', wrap: true })
  r++

  labelRow(r, [
    ['説明日', 2, jaDate(plan.explanationDate), 2],
    ['説明者', 2, plan.explainerName ?? '', 2],
  ])
  r++

  ws.getRow(r).height = estimateTextHeight(facilityName, widthUnits(3, 8), 9, 20)
  mg(`A${r}:B${r}`, `A${r}`, '事業所名称', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, facilityName, { size: 9 })
  r++

  labelRow(r, [
    ['利用者同意署名', 2, plan.familySignature ?? '', 2],
    ['代筆者署名', 2, plan.proxySignature ?? '', 2],
  ])

  return wb
}
