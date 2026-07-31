import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, TableLayoutType, PageOrientation,
  type ISectionOptions,
} from 'docx'
import type { AnalyticsReportData, ReportTable } from './analytics-report-data'

const FONT = 'MS Gothic'
const HEADER_FILL = 'E5E7EB'
const BORDER_COLOR = '999999'

// A4 サイズ（dxa = 1/20pt）。横向きページは幅と高さを入れ替える。
const A4_WIDTH = 11906
const A4_HEIGHT = 16838
const PORTRAIT_MARGIN = 1000
const LANDSCAPE_MARGIN = 720

const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR }
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

// 文字の見た目上の幅（全角=2、半角=1）からおおよその必要幅を見積もる
function textWeight(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1
  return w
}

function estimateColumnWidths(table: ReportTable, totalWidth: number): number[] {
  const weights = table.headers.map((h, i) => {
    const headerW = textWeight(h)
    const cellW = table.rows.reduce((max, row) => {
      const v = row[i]
      return Math.max(max, textWeight(v == null ? '' : String(v)))
    }, 0)
    return Math.max(headerW, cellW, 3)
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const minWidth = Math.floor(totalWidth * 0.04)
  const raw = weights.map(w => Math.max(Math.floor((w / totalWeight) * totalWidth), minWidth))
  // 端数調整（丸め誤差を最終列に寄せる）
  const sum = raw.reduce((a, b) => a + b, 0)
  raw[raw.length - 1] += totalWidth - sum
  return raw
}

function buildTable(table: ReportTable, totalWidth: number): (Paragraph | Table)[] {
  const colWidths = estimateColumnWidths(table, totalWidth)

  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: HEADER_FILL },
      borders: allBorders,
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, size: 16, font: FONT })],
      })],
    })),
  })

  const dataRows = table.rows.map(row => new TableRow({
    children: row.map((cell, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      borders: allBorders,
      children: [new Paragraph({
        children: [new TextRun({ text: cell == null ? '' : String(cell), size: 16, font: FONT })],
      })],
    })),
  }))

  const docxTable = new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  })

  return [
    new Paragraph({
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: table.title, bold: true, size: 22, font: FONT, color: '1a3c6e' })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '1a3c6e' } },
    }),
    docxTable,
    new Paragraph({ text: '', spacing: { after: 200 } }),
  ]
}

export async function buildAnalyticsReportWord(data: AnalyticsReportData): Promise<Buffer> {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })

  const portraitWidth = A4_WIDTH - PORTRAIT_MARGIN * 2
  const landscapeWidth = A4_HEIGHT - LANDSCAPE_MARGIN * 2

  const portraitTables = data.tables.filter(t => (t.keyColumns ?? 0) === 0 && t.rows.length > 0)
  const wideTables = data.tables.filter(t => (t.keyColumns ?? 0) > 0 && t.rows.length > 0)

  const headerChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: '月次サービス利用集計', bold: true, size: 40, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: `対象：${data.year}年${data.month}月　利用者：${data.targetName}　記録件数：${data.totalRecords}件`,
        size: 22, font: FONT,
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [new TextRun({ text: `作成日　　${today}`, size: 18, color: '555555', font: FONT })],
    }),
  ]

  const portraitChildren: (Paragraph | Table)[] = [...headerChildren]
  for (const t of portraitTables) portraitChildren.push(...buildTable(t, portraitWidth))

  const sections: ISectionOptions[] = [
    {
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1440, bottom: 1440, left: PORTRAIT_MARGIN, right: PORTRAIT_MARGIN },
        },
      },
      children: portraitChildren,
    },
  ]

  if (wideTables.length > 0) {
    const landscapeChildren: (Paragraph | Table)[] = []
    for (const t of wideTables) landscapeChildren.push(...buildTable(t, landscapeWidth))
    sections.push({
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.LANDSCAPE },
          margin: { top: LANDSCAPE_MARGIN, bottom: LANDSCAPE_MARGIN, left: LANDSCAPE_MARGIN, right: LANDSCAPE_MARGIN },
        },
      },
      children: landscapeChildren,
    })
  }

  const doc = new Document({ sections })

  const nodeBuffer = await Packer.toBuffer(doc)
  return Buffer.from(nodeBuffer)
}
