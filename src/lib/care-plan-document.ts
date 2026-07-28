import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign } from 'docx'
import type { CarePlan, CarePlanGoal, Resident } from '@/types/database'

export { Packer }

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

  ws.columns = [
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 10 },
  ]
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

  ws.getRow(r).height = 20
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
    ws.getRow(r).height = 50
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
    ws.getRow(r).height = 32
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
  ws.getRow(r).height = 40
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, `評価内容：${plan.evaluationContent ?? ''}`, { size: 10, v: 'top', wrap: true })
  r++
  r++

  ws.getRow(r).height = 16
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記の通所介護計画によりサービス提供を行います。', { size: 9 })
  r++
  ws.getRow(r).height = 16
  mg(`A${r}:D${r}`, `A${r}`, `説明日：${jaDate(plan.explanationDate)}`, { size: 9 })
  mg(`E${r}:${LAST_COL}${r}`, `E${r}`, `説明者：${plan.explainerName ?? ''}`, { size: 9 })
  r++
  ws.getRow(r).height = 16
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, `事業所名称：${facilityName}`, { size: 9 })
  r++
  ws.getRow(r).height = 30
  mg(`A${r}:${LAST_COL}${r}`, `A${r}`, '上記計画の内容について説明を受け同意し、交付されました。', { size: 9, v: 'top', wrap: true })
  r++
  ws.getRow(r).height = 18
  mg(`A${r}:D${r}`, `A${r}`, `利用者同意署名欄：${plan.familyConfirmation ?? ''}`, { size: 9 })
  mg(`E${r}:${LAST_COL}${r}`, `E${r}`, `代筆者署名欄（続柄）：${plan.proxySigner ?? ''}`, { size: 9 })

  return wb
}

// ─── Word ───────────────────────────────────────────────────────────
function cell(text: string, opts: { bold?: boolean; width?: number; shade?: string; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, font: 'MS Gothic', size: 20 })],
    })],
  })
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '0F766E' } },
    children: [new TextRun({ text, bold: true, size: 22, font: 'MS Gothic', color: '0F766E' })],
  })
}

function bodyText(text: string) {
  const lines = (text || '').split('\n')
  return lines.map(line => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: line || ' ', size: 20, font: 'MS Gothic' })],
  }))
}

export function buildCarePlanWord(resident: Resident, facilityName: string, plan: CarePlan): Document {
  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '通所介護計画書', bold: true, size: 36, font: 'MS Gothic' })],
  }))

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell('作成年月日', { bold: true, width: 20, shade: 'F3F4F6' }),
        cell(jaDate(plan.planDate), { width: 30 }),
        cell('作成者', { bold: true, width: 20, shade: 'F3F4F6' }),
        cell(plan.staffName ?? '', { width: 30 }),
      ] }),
      new TableRow({ children: [
        cell('利用者氏名', { bold: true, shade: 'F3F4F6' }),
        cell(`${resident.name} 様`),
        cell('生年月日', { bold: true, shade: 'F3F4F6' }),
        cell(jaDate(plan.birthDate)),
      ] }),
      new TableRow({ children: [
        cell('要介護', { bold: true, shade: 'F3F4F6' }),
        cell(plan.careLevel ?? ''),
        cell('', { shade: 'F3F4F6' }),
        cell(''),
      ] }),
    ],
  }))

  const textSections: [string, string | null][] = [
    ['【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】', plan.needsAnalysis],
    ['【総合的な援助の方針】', plan.supportPolicy],
    ['【ゴールのイメージ】', plan.goalImage],
  ]
  for (const [label, text] of textSections) {
    children.push(sectionHeading(label))
    children.push(...bodyText(text ?? ''))
  }

  children.push(sectionHeading('【援助目標】'))
  const goals: CarePlanGoal[] = plan.goals && plan.goals.length > 0 ? plan.goals : [
    { issue: '', longTermGoal: '', shortTermGoal: '', serviceContent: '', frequency: '' },
  ]
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell('解決すべき課題（ニーズ）', { bold: true, width: 28, shade: 'E5E7EB' }),
        cell('長期目標', { bold: true, width: 18, shade: 'E5E7EB' }),
        cell('短期目標', { bold: true, width: 18, shade: 'E5E7EB' }),
        cell('サービス内容', { bold: true, width: 26, shade: 'E5E7EB' }),
        cell('頻度', { bold: true, width: 10, shade: 'E5E7EB' }),
      ] }),
      ...goals.map(g => new TableRow({ children: [
        cell(g.issue), cell(g.longTermGoal), cell(g.shortTermGoal), cell(g.serviceContent), cell(g.frequency),
      ] })),
    ],
  }))

  children.push(sectionHeading('【サービス達成状況】'))
  children.push(...bodyText(`モニタリング日：${jaDate(plan.monitoringDate)}`))
  children.push(...bodyText(`期間：${jaDate(plan.evaluationPeriodStart)} ～ ${jaDate(plan.evaluationPeriodEnd)}`))
  children.push(...bodyText(`評価内容：${plan.evaluationContent ?? ''}`))

  children.push(sectionHeading('説明・同意'))
  children.push(...bodyText('上記の通所介護計画によりサービス提供を行います。'))
  children.push(...bodyText(`説明日：${jaDate(plan.explanationDate)}　　説明者：${plan.explainerName ?? ''}`))
  children.push(...bodyText(`事業所名称：${facilityName}`))
  children.push(...bodyText('上記計画の内容について説明を受け同意し、交付されました。'))
  children.push(...bodyText(`利用者同意署名欄：${plan.familyConfirmation ?? ''}`))
  children.push(...bodyText(`代筆者署名欄（続柄）：${plan.proxySigner ?? ''}`))

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  })
}
