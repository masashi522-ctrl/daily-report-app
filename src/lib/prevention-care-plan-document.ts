import ExcelJS from 'exceljs'
import { PREVENTION_PROGRAMS, type CarePlan, type CarePlanGoal, type Resident } from '@/types/database'
import {
  COL,
  COLUMN_WIDTHS,
  FONT,
  estimateTextHeight,
  jaDate,
  sheetSafeName,
  widthUnits,
} from '@/lib/care-plan-document'

// 要支援の方に交付する「介護予防通所介護計画書」。
// 通所介護計画書とは様式が異なり、目標とする生活・必要な事業プログラム・
// 援助目標（目標／支援のポイント／サービス内容／頻度／期間）の欄を持つ。
export function buildPreventionCarePlanExcel(
  resident: Resident,
  facilityName: string,
  plan: CarePlan,
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
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '介護予防通所介護計画書',
    { bg: COL.titleBg, fg: COL.titleFg, bold: true, size: 15, h: 'center' })
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:C${r}`, `A${r}`, `作成年月日：${jaDate(plan.planDate)}`, { size: 9, fg: COL.lblFg })
  mg(`D${r}:F${r}`, `D${r}`, `作成者：${plan.staffName ?? ''}`, { size: 9, fg: COL.lblFg })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, `第${plan.version ?? 1}版`, { size: 9, fg: COL.lblFg, h: 'right' })
  r++

  // 氏名・性別・要支援度・生年月日
  ws.getRow(r).height = 20
  sc(`A${r}`, '氏名', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`B${r}:C${r}`, `B${r}`, `${resident.name} 様`, { size: 10, bold: true })
  sc(`D${r}`, '性別', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`E${r}`, plan.gender ?? '', { size: 9, h: 'center' })
  sc(`F${r}`, '要支援度', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`G${r}`, plan.careLevel ?? '', { size: 9, h: 'center' })
  sc(`H${r}`, jaDate(plan.birthDate), { size: 8, h: 'center' })
  r++
  r++

  // 目標とする生活
  secHdr(r, '【目標とする生活】'); r++
  const livingGoals: [string, string | null][] = [
    ['1日', plan.dailyGoal],
    ['1年', plan.yearlyGoal],
  ]
  for (const [label, text] of livingGoals) {
    ws.getRow(r).height = estimateTextHeight(text, widthUnits(2, 8), 10, 20)
    sc(`A${r}`, label, { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 9, h: 'center' })
    mg(`B${r}:${LAST_COL}${r}`, `B${r}`, text ?? '', { size: 10, v: 'top', wrap: true })
    r++
  }
  r++

  const textSections: [string, string | null][] = [
    ['【総合的な方針（生活不活発病の改善・予防のポイント）】', plan.supportPolicy],
    ['【ゴールのイメージ】', plan.goalImage],
    ['【健康状態についての留意点】', plan.healthNotes],
    ['【総合的な課題】', plan.needsAnalysis],
  ]
  for (const [label, text] of textSections) {
    secHdr(r, label); r++
    ws.getRow(r).height = estimateTextHeight(text, widthUnits(1, 8), 10, 24)
    mg(`A${r}:${LAST_COL}${r}`, `A${r}`, text ?? '', { size: 10, v: 'top', wrap: true })
    r++
  }
  r++

  // 必要な事業プログラム（選択済みは■、未選択は□）
  secHdr(r, '【必要な事業プログラム】'); r++
  const selected = (plan.programs ?? '').split(',').filter(Boolean)
  ws.getRow(r).height = 26
  PREVENTION_PROGRAMS.forEach((program, i) => {
    const col = String.fromCharCode(65 + i)
    sc(`${col}${r}`, `${selected.includes(program) ? '■' : '□'} ${program}`,
      { size: 8, h: 'center', wrap: true })
  })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, '', {})
  r++
  r++

  // 援助目標
  secHdr(r, '【援助目標】'); r++
  ws.getRow(r).height = 16
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`,
    `利用時間： ${plan.serviceStartTime ?? ''} から ${plan.serviceEndTime ?? ''}`,
    { size: 9, h: 'right' })
  r++

  ws.getRow(r).height = 16
  mg(`A${r}:B${r}`, `A${r}`, '目標', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:D${r}`, `C${r}`, '支援のポイント', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`E${r}:F${r}`, `E${r}`, 'サービス内容', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`G${r}`, '頻度', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  sc(`H${r}`, '期間', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  r++

  const emptyGoal: CarePlanGoal = {
    issue: '', longTermGoal: '', shortTermGoal: '', serviceContent: '', frequency: '',
    goal: '', supportPoint: '', period: '',
  }
  const goals: CarePlanGoal[] = plan.goals && plan.goals.length > 0 ? plan.goals : [emptyGoal]
  for (const g of goals) {
    ws.getRow(r).height = Math.max(
      estimateTextHeight(g.goal, widthUnits(1, 2), 9, 24),
      estimateTextHeight(g.supportPoint, widthUnits(3, 4), 9, 24),
      estimateTextHeight(g.serviceContent, widthUnits(5, 6), 9, 24),
      estimateTextHeight(g.frequency, widthUnits(7, 7), 9, 24),
      estimateTextHeight(g.period, widthUnits(8, 8), 9, 24),
    )
    mg(`A${r}:B${r}`, `A${r}`, g.goal ?? '', { size: 9, v: 'top', wrap: true })
    mg(`C${r}:D${r}`, `C${r}`, g.supportPoint ?? '', { size: 9, v: 'top', wrap: true })
    mg(`E${r}:F${r}`, `E${r}`, g.serviceContent, { size: 9, v: 'top', wrap: true })
    sc(`G${r}`, g.frequency, { size: 9, v: 'top', wrap: true })
    sc(`H${r}`, g.period ?? '', { size: 9, v: 'top', wrap: true })
    r++
  }
  r++

  // サービス達成状況
  secHdr(r, '【サービス達成状況】'); r++
  ws.getRow(r).height = 18
  mg(`A${r}:B${r}`, `A${r}`, `モニタリング日：${jaDate(plan.monitoringDate)}`, { size: 9 })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`,
    `期間：${jaDate(plan.evaluationPeriodStart)} ～ ${jaDate(plan.evaluationPeriodEnd)}`, { size: 9 })
  r++
  ws.getRow(r).height = estimateTextHeight(plan.evaluationContent, widthUnits(1, 8), 10, 24)
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, `内容：${plan.evaluationContent ?? ''}`, { size: 10, v: 'top', wrap: true })
  r++
  r++

  ws.getRow(r).height = 18
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記の介護予防通所介護計画によりサービス提供を行います。',
    { size: 9, v: 'top', wrap: true })
  r++

  ws.getRow(r).height = 20
  mg(`A${r}:B${r}`, `A${r}`, '説明日', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:D${r}`, `C${r}`, jaDate(plan.explanationDate), { size: 9, h: 'center' })
  mg(`E${r}:F${r}`, `E${r}`, '説明者', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`G${r}:${LAST_COL}${r}`, `G${r}`, plan.explainerName ?? '', { size: 9, h: 'center' })
  r++

  ws.getRow(r).height = estimateTextHeight(facilityName, widthUnits(3, 8), 9, 20)
  mg(`A${r}:B${r}`, `A${r}`, '事業所名称', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, facilityName, { size: 9 })
  r++

  ws.getRow(r).height = Math.max(estimateTextHeight(plan.familyConfirmation, widthUnits(3, 8), 9, 24), 24)
  mg(`A${r}:B${r}`, `A${r}`, '利用者同意署名欄', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, plan.familyConfirmation ?? '', { size: 9, wrap: true })
  r++

  ws.getRow(r).height = Math.max(estimateTextHeight(plan.proxySigner, widthUnits(3, 8), 9, 24), 24)
  mg(`A${r}:B${r}`, `A${r}`, '代行署名欄', { bg: COL.lblBg, fg: COL.lblFg, bold: true, size: 8, h: 'center' })
  mg(`C${r}:${LAST_COL}${r}`, `C${r}`, plan.proxySigner ?? '', { size: 9, wrap: true })

  return wb
}
