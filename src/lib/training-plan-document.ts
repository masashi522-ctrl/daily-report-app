import ExcelJS from 'exceljs'
import type { TrainingPlan } from '@/types/database'

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
  resident: { name: string; careLevel: string | null },
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

  let r = 1

  ws.getRow(r).height = 26
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '機能訓練計画書',
    { bg: COL.titleBg, fg: COL.titleFg, bold: true, size: 15, h: 'center' })
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:D${r}`, `A${r}`, `作成年月日：${jaDate(plan.planDate)}`, { size: 9, fg: COL.lblFg })
  mg(`E${r}:${LAST_COL}${r}`, `E${r}`, `作成者：${plan.staffName ?? ''}`, { size: 9, fg: COL.lblFg })
  r++

  ws.getRow(r).height = estimateTextHeight(`利用者氏名：${resident.name} 様`, widthUnits(1, 3), 11, 20)
  mg(`A${r}:C${r}`, `A${r}`, `利用者氏名：${resident.name} 様`, { bold: true, size: 11 })
  mg(`D${r}:E${r}`, `D${r}`, `次回評価日：${jaDate(plan.nextReviewDate)}`, { size: 9 })
  mg(`F${r}:${LAST_COL}${r}`, `F${r}`, `要介護：${resident.careLevel ?? ''}`, { size: 9 })
  r++
  r++

  const textSections: [string, string | null][] = [
    ['【心身の状況（既往歴・現病歴等）】', plan.physicalStatus],
    ['【本人の意向】', plan.userIntention],
    ['【家族の意向】', plan.familyIntention],
    ['【課題（ニーズ）】', plan.issues],
    ['【長期目標】', plan.longTermGoal],
    ['【短期目標】', plan.shortTermGoal],
    ['【訓練内容・実施方法】', plan.trainingContent],
  ]
  for (const [label, text] of textSections) {
    secHdr(r, label); r++
    ws.getRow(r).height = estimateTextHeight(text, widthUnits(1, 8), 10, 24)
    mg(`A${r}:${LAST_COL}${r}`, `A${r}`, text ?? '', { size: 10, v: 'top', wrap: true })
    r++
  }

  ws.getRow(r).height = 18
  mg(`A${r}:B${r}`, `A${r}`, '実施頻度・時間', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, plan.frequency ?? '', { size: 9 })
  r++
  r++

  secHdr(r, '【留意事項・特記事項】'); r++
  ws.getRow(r).height = estimateTextHeight(plan.notes, widthUnits(1, 8), 10, 24)
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, plan.notes ?? '', { size: 10, v: 'top', wrap: true })
  r++
  r++

  ws.getRow(r).height = estimateTextHeight(facilityName, widthUnits(3, 8), 9, 20)
  mg(`A${r}:B${r}`, `A${r}`, '事業所名称', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, facilityName, { size: 9 })

  return wb
}
