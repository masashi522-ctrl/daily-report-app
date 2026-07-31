import PDFDocument from 'pdfkit'
import path from 'path'
import type { AnalyticsReportData, ReportTable } from './analytics-report-data'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')
const FONT_REGULAR = path.join(FONT_DIR, 'MPLUS1p-Regular.ttf')
const FONT_BOLD = path.join(FONT_DIR, 'MPLUS1p-Bold.ttf')

const PAGE_MARGIN = 36
const ROW_HEIGHT = 16
const CELL_PADDING = 4
const FONT_SIZE = 8
const HEADER_FILL = '#e5e7eb'
const HEADER_TEXT = '#1f2937'
const BORDER_COLOR = '#d1d5db'
const TEXT_COLOR = '#111827'

// 各列の必要幅（見出しは太字、値は通常フォントで測る）
function rawColumnWidths(doc: PDFKit.PDFDocument, headers: string[], rows: (string | number | null)[][]): number[] {
  return headers.map((h, i) => {
    doc.font('bold')
    const headerW = doc.widthOfString(h)
    doc.font('normal')
    const cellW = rows.reduce((max, row) => {
      const v = row[i]
      const s = v == null ? '' : String(v)
      return Math.max(max, doc.widthOfString(s))
    }, 0)
    return Math.max(headerW, cellW) + CELL_PADDING * 2
  })
}

// 列数が多くページ幅に収まらない表を、先頭 keyCount 列を各分割表に繰り返しつつ列単位で分割する
function splitColumnsToFit(rawWidths: number[], usableWidth: number, keyCount: number): number[][] {
  const keyWidth = rawWidths.slice(0, keyCount).reduce((a, b) => a + b, 0)
  const chunks: number[][] = []
  let current: number[] = []
  let currentWidth = keyWidth
  for (let i = keyCount; i < rawWidths.length; i++) {
    const w = rawWidths[i]
    if (current.length > 0 && currentWidth + w > usableWidth) {
      chunks.push(current)
      current = []
      currentWidth = keyWidth
    }
    current.push(i)
    currentWidth += w
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current)
  return chunks
}

function drawSingleTable(
  doc: PDFKit.PDFDocument,
  title: string,
  headers: string[],
  rows: (string | number | null)[][],
  rawWidths: number[],
  usableWidth: number,
) {
  const totalRaw = rawWidths.reduce((a, b) => a + b, 0)
  const scale = totalRaw > usableWidth ? usableWidth / totalRaw : 1
  const colWidths = rawWidths.map(w => Math.max(w * scale, 22))

  const marginLeft = doc.page.margins.left
  const bottomLimit = doc.page.height - doc.page.margins.bottom

  doc.font('bold').fontSize(11).fillColor(TEXT_COLOR)
  doc.text(title, marginLeft, doc.y, { width: usableWidth })
  doc.moveDown(0.3)

  function drawHeaderRow() {
    const y = doc.y
    let x = marginLeft
    doc.font('bold').fontSize(FONT_SIZE)
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], ROW_HEIGHT).fillAndStroke(HEADER_FILL, BORDER_COLOR)
      doc.fillColor(HEADER_TEXT).text(h, x + CELL_PADDING, y + 4, {
        width: colWidths[i] - CELL_PADDING * 2,
        height: ROW_HEIGHT - 4,
        ellipsis: true,
        lineBreak: false,
      })
      x += colWidths[i]
    })
    doc.y = y + ROW_HEIGHT
  }

  const layout = doc.page.layout === 'landscape' ? 'landscape' : 'portrait'
  function ensureSpace() {
    if (doc.y + ROW_HEIGHT > bottomLimit) {
      doc.addPage({ layout, size: 'A4', margins: doc.page.margins })
      drawHeaderRow()
    }
  }

  ensureSpace()
  drawHeaderRow()

  doc.font('normal').fontSize(FONT_SIZE)
  for (const row of rows) {
    ensureSpace()
    const y = doc.y
    let x = marginLeft
    row.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i], ROW_HEIGHT).stroke(BORDER_COLOR)
      doc.fillColor(TEXT_COLOR).font('normal').fontSize(FONT_SIZE).text(
        cell == null ? '' : String(cell),
        x + CELL_PADDING, y + 4,
        { width: colWidths[i] - CELL_PADDING * 2, height: ROW_HEIGHT - 4, ellipsis: true, lineBreak: false },
      )
      x += colWidths[i]
    })
    doc.y = y + ROW_HEIGHT
  }
  doc.moveDown(1)
}

function drawTable(doc: PDFKit.PDFDocument, table: ReportTable, usableWidth: number) {
  doc.font('normal').fontSize(FONT_SIZE)
  const rawWidths = rawColumnWidths(doc, table.headers, table.rows)
  const totalRaw = rawWidths.reduce((a, b) => a + b, 0)
  const keyCount = table.keyColumns ?? 0

  if (totalRaw <= usableWidth || keyCount >= table.headers.length) {
    drawSingleTable(doc, table.title, table.headers, table.rows, rawWidths, usableWidth)
    return
  }

  const keyIdx = Array.from({ length: keyCount }, (_, i) => i)
  const chunks = splitColumnsToFit(rawWidths, usableWidth, keyCount)
  chunks.forEach((chunkIdx, ci) => {
    const idx = [...keyIdx, ...chunkIdx]
    const title = ci === 0 ? table.title : `${table.title}（続き ${ci + 1}/${chunks.length}）`
    const headers = idx.map(i => table.headers[i])
    const rows = table.rows.map(r => idx.map(i => r[i]))
    const widths = idx.map(i => rawWidths[i])
    drawSingleTable(doc, title, headers, rows, widths, usableWidth)
  })
}

// 表の総幅がページ幅に収まらない（列数が多い＝日別詳細など）場合は横向きページを使う
function needsLandscape(doc: PDFKit.PDFDocument, table: ReportTable, portraitWidth: number): boolean {
  doc.font('normal').fontSize(FONT_SIZE)
  const raw = rawColumnWidths(doc, table.headers, table.rows)
  return raw.reduce((a, b) => a + b, 0) > portraitWidth
}

export async function buildAnalyticsReportPdf(data: AnalyticsReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, layout: 'portrait', bufferPages: true })
  doc.registerFont('normal', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('normal')

  const chunks: Buffer[] = []
  doc.on('data', chunk => chunks.push(chunk))
  const done = new Promise<Buffer>(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  const portraitWidth = doc.page.width - PAGE_MARGIN * 2

  doc.font('bold').fontSize(18).fillColor(TEXT_COLOR)
  doc.text('月次サービス利用集計', { align: 'center' })
  doc.moveDown(0.3)
  doc.font('normal').fontSize(11)
  doc.text(`対象：${data.year}年${data.month}月　利用者：${data.targetName}　記録件数：${data.totalRecords}件`, { align: 'center' })
  doc.moveDown(1)

  for (const table of data.tables) {
    if (table.rows.length === 0) continue
    if (needsLandscape(doc, table, portraitWidth)) {
      doc.addPage({ size: 'A4', margin: PAGE_MARGIN, layout: 'landscape' })
      drawTable(doc, table, doc.page.width - PAGE_MARGIN * 2)
    } else {
      if (doc.y + ROW_HEIGHT * 2 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage({ size: 'A4', margin: PAGE_MARGIN, layout: 'portrait' })
      }
      drawTable(doc, table, portraitWidth)
    }
  }

  doc.end()
  return done
}
