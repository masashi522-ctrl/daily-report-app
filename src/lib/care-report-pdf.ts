import PDFDocument from 'pdfkit'
import path from 'path'
import type { ReportPhoto } from './care-report-photo'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')
const FONT_REGULAR = path.join(FONT_DIR, 'MPLUS1p-Regular.ttf')
const FONT_BOLD = path.join(FONT_DIR, 'MPLUS1p-Bold.ttf')

const PAGE_MARGIN = 56
const TEXT_COLOR = '#111827'
const HEADER_COLOR = '#1a3c6e'
const MUTED_COLOR = '#555555'

interface ReportSection {
  header: string
  body: string
}

function parseReportSections(text: string): ReportSection[] {
  const parts = text.split(/(?=【[^】]+】)/)
  return parts
    .filter(p => p.trim())
    .map(p => {
      const match = p.match(/^【([^】]+)】\s*([\s\S]*)$/)
      if (match) return { header: `【${match[1]}】`, body: match[2].trim() }
      return { header: '', body: p.trim() }
    })
}

interface DailyNote {
  date: string
  text: string
}

export async function buildCareReportPdf(
  reportText: string,
  residentName: string,
  year: number,
  month: number,
  dailyNotes: DailyNote[] = [],
  photos: ReportPhoto[] = [],
): Promise<Buffer> {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const sections = parseReportSections(reportText)

  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, layout: 'portrait', bufferPages: true })
  doc.registerFont('normal', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('normal')

  const chunks: Buffer[] = []
  doc.on('data', chunk => chunks.push(chunk))
  const done = new Promise<Buffer>(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  const usableWidth = doc.page.width - PAGE_MARGIN * 2

  doc.font('bold').fontSize(20).fillColor(TEXT_COLOR)
  doc.text('月次サービス利用報告書', { align: 'center' })
  doc.moveDown(0.3)
  doc.font('normal').fontSize(13)
  doc.text(`${year}年${month}月度`, { align: 'center' })
  doc.moveDown(1)

  doc.font('bold').fontSize(13).fillColor(TEXT_COLOR)
  doc.text(`利用者氏名　　${residentName} 様`)
  doc.moveTo(PAGE_MARGIN, doc.y + 4).lineTo(PAGE_MARGIN + usableWidth, doc.y + 4).strokeColor('#888888').stroke()
  doc.moveDown(0.6)

  doc.font('normal').fontSize(10).fillColor(MUTED_COLOR)
  doc.text(`作成日　　${today}`, { align: 'right' })
  doc.moveDown(1.2)

  for (const section of sections) {
    if (section.header) {
      doc.font('bold').fontSize(12).fillColor(HEADER_COLOR)
      doc.text(section.header)
      doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(PAGE_MARGIN + usableWidth, doc.y + 2).strokeColor(HEADER_COLOR).stroke()
      doc.moveDown(0.5)
    }
    if (section.body) {
      doc.font('normal').fontSize(10.5).fillColor(TEXT_COLOR)
      const lines = section.body.split('\n').filter(l => l.trim())
      for (const line of lines) {
        doc.text(line, { width: usableWidth, lineGap: 3 })
        doc.moveDown(0.3)
      }
      doc.moveDown(0.5)
    }
  }

  if (dailyNotes.length > 0) {
    doc.font('bold').fontSize(12).fillColor(HEADER_COLOR)
    doc.text('【当月の特記事項】')
    doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(PAGE_MARGIN + usableWidth, doc.y + 2).strokeColor(HEADER_COLOR).stroke()
    doc.moveDown(0.5)
    doc.font('normal').fontSize(10.5).fillColor(TEXT_COLOR)
    for (const note of dailyNotes) {
      const d = note.date.split('-')
      doc.text(`${parseInt(d[1])}月${parseInt(d[2])}日　${note.text}`, { width: usableWidth, lineGap: 3 })
      doc.moveDown(0.3)
    }
    doc.moveDown(0.5)
  }

  if (photos.length > 0) {
    doc.font('bold').fontSize(12).fillColor(HEADER_COLOR)
    doc.text('【今月の様子（写真）】')
    doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(PAGE_MARGIN + usableWidth, doc.y + 2).strokeColor(HEADER_COLOR).stroke()
    doc.moveDown(0.5)

    const gap = 10
    const imgWidth = (usableWidth - gap) / 2
    const imgHeight = 150
    photos.forEach((photo, i) => {
      const col = i % 2
      if (col === 0 && doc.y + imgHeight > doc.page.height - PAGE_MARGIN) {
        doc.addPage()
      }
      const x = PAGE_MARGIN + col * (imgWidth + gap)
      const y = doc.y
      try {
        doc.image(photo.buffer, x, y, { fit: [imgWidth, imgHeight], align: 'center' })
      } catch {
        // 破損データ等で埋め込みに失敗した場合はスキップ
      }
      if (col === 1 || i === photos.length - 1) doc.y = y + imgHeight + gap
    })
  }

  doc.end()
  return done
}
