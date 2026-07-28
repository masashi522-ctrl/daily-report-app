import ExcelJS from 'exceljs'
import type { CarePlan, CarePlanGoal, Resident } from '@/types/database'

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

// 列幅とフォントサイズから、折り返し後に文章が切れないための行の高さ(pt)を見積もる
function estimateTextHeight(text: string | null | undefined, units: number, fontSize: number, minHeight: number): number {
  const t = (text ?? '').trim()
  if (!t) return minHeight
  const charsPerLine = Math.max(6, Math.floor(units * (10 / fontSize) * 0.52))
  const lines = t.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)), 0)
  const lineHeight = fontSize * 1.6
  return Math.max(minHeight, Math.ceil(lines * lineHeight + 8))
}

export function buildCarePlanExcel(resident: Resident, facilityName: string, plan: CarePlan): ExcelJS.Workbook {
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

  let r = 1

  ws.getRow(r).height = 26
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '通所介護計画書',
    { bg: COL.titleBg, fg: COL.titleFg, bold: true, size: 15, h: 'center' })
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:D${r}`, `A${r}`, `作成年月日：${jaDate(plan.planDate)}`, { size: 9, fg: COL.lblFg })
  mg(`E${r}:${LAST_COL}${r}`, `E${r}`, `作成者：${plan.staffName ?? ''}`, { size: 9, fg: COL.lblFg })
  r++

  ws.getRow(r).height = estimateTextHeight(`利用者氏名：${resident.name} 様`, widthUnits(1, 3), 11, 20)
  mg(`A${r}:C${r}`, `A${r}`, `利用者氏名：${resident.name} 様`, { bold: true, size: 11 })
  mg(`D${r}:E${r}`, `D${r}`, `生年月日：${jaDate(plan.birthDate)}`, { size: 9 })
  mg(`F${r}:${LAST_COL}${r}`, `F${r}`, `要介護：${plan.careLevel ?? ''}`, { size: 9 })
  r++
  r++

  const textSections: [string, string | null][] = [
    ['【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】', plan.needsAnalysis],
    ['【総合的な援助の方針】', plan.supportPolicy],
    ['【ゴールのイメージ】', plan.goalImage],
  ]
  for (const [label, text] of textSections) {
    secHdr(r, label); r++
    ws.getRow(r).height = estimateTextHeight(text, widthUnits(1, 8), 10, 24)
    mg(`A${r}:${LAST_COL}${r}`, `A${r}`, text ?? '', { size: 10, v: 'top', wrap: true })
    r++
  }

  secHdr(r, '【援助目標】'); r++
  ws.getRow(r).height = 16
  mg(`A${r}:B${r}`, `A${r}`, '解決すべき課題（ニーズ）', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`C${r}`, '長期目標', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`D${r}:E${r}`, `D${r}`, '短期目標', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`F${r}:G${r}`, `F${r}`, 'サービス内容', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`H${r}`, '頻度', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  r++

  const goals: CarePlanGoal[] = plan.goals && plan.goals.length > 0 ? plan.goals : [
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

  secHdr(r, '【サービス達成状況】'); r++
  ws.getRow(r).height = 18
  mg(`A${r}:B${r}`, `A${r}`, `モニタリング日：${jaDate(plan.monitoringDate)}`, { size: 9 })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`,
    `期間：${jaDate(plan.evaluationPeriodStart)} ～ ${jaDate(plan.evaluationPeriodEnd)}`, { size: 9 })
  r++
  ws.getRow(r).height = estimateTextHeight(plan.evaluationContent, widthUnits(1, 8), 10, 24)
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, `評価内容：${plan.evaluationContent ?? ''}`, { size: 10, v: 'top', wrap: true })
  r++
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記の通所介護計画によりサービス提供を行います。', { size: 9, v: 'top', wrap: true })
  r++

  ws.getRow(r).height = Math.max(
    20,
    estimateTextHeight(plan.explainerName, widthUnits(7, 8), 9, 20),
  )
  mg(`A${r}:B${r}`, `A${r}`, '説明日', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:D${r}`, `C${r}`, jaDate(plan.explanationDate), { size: 9, h: 'center' })
  mg(`E${r}:F${r}`, `E${r}`, '説明者', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, plan.explainerName ?? '', { size: 9, h: 'center' })
  r++

  ws.getRow(r).height = estimateTextHeight(facilityName, widthUnits(3, 8), 9, 20)
  mg(`A${r}:B${r}`, `A${r}`, '事業所名称', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, facilityName, { size: 9 })
  r++
  r++

  ws.getRow(r).height = 30
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記計画の内容について説明を受け同意し、交付されました。', { size: 9, v: 'top', wrap: true })
  r++

  ws.getRow(r).height = Math.max(
    estimateTextHeight(plan.familyConfirmation, widthUnits(3, 4), 9, 24),
    estimateTextHeight(plan.proxySigner, widthUnits(7, 8), 9, 24),
  )
  mg(`A${r}:B${r}`, `A${r}`, '利用者同意署名欄', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:D${r}`, `C${r}`, plan.familyConfirmation ?? '', { size: 9, h: 'center', wrap: true })
  mg(`E${r}:F${r}`, `E${r}`, '代筆者署名欄（続柄）', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, plan.proxySigner ?? '', { size: 9, h: 'center', wrap: true })

  return wb
}
