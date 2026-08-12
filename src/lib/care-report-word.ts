import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx'

const FONT = 'MS Gothic'

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

function buildResidentSection(
  reportText: string,
  residentName: string,
  year: number,
  month: number,
  today: string,
  pageBreakBefore: boolean,
): Paragraph[] {
  const sections = parseReportSections(reportText)
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      pageBreakBefore,
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: '月次サービス利用報告書', bold: true, size: 52, font: FONT })],
    }),
  )

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [new TextRun({ text: `${year}年${month}月度`, size: 32, font: FONT })],
    }),
  )

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `利用者氏名　　${residentName} 様`, bold: true, size: 28, font: FONT })],
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888' } },
    }),
  )
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `作成日　　${today}`, size: 22, color: '555555', font: FONT })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 400 },
    }),
  )

  for (const section of sections) {
    if (section.header) {
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 100 },
          children: [new TextRun({ text: section.header, bold: true, size: 26, font: FONT, color: '1a3c6e' })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '1a3c6e' } },
        }),
      )
    }
    if (section.body) {
      const lines = section.body.split('\n').filter(l => l.trim())
      for (const line of lines) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: line, size: 24, font: FONT })],
          }),
        )
      }
    }
  }

  return children
}

export async function buildCareReportWord(
  reportText: string,
  residentName: string,
  year: number,
  month: number,
): Promise<Buffer> {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const children = buildResidentSection(reportText, residentName, year, month, today, false)

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1700, right: 1700 } },
        },
        children,
      },
    ],
  })

  const nodeBuffer = await Packer.toBuffer(doc)
  return Buffer.from(nodeBuffer)
}

// 複数利用者分の月次報告書を1つのWordファイルにまとめる（1名につき1ページ）
export async function buildBulkCareReportWord(
  reports: { residentName: string; reportText: string }[],
  year: number,
  month: number,
): Promise<Buffer> {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const children = reports.flatMap((r, i) =>
    buildResidentSection(r.reportText, r.residentName, year, month, today, i > 0),
  )

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1700, right: 1700 } },
        },
        children,
      },
    ],
  })

  const nodeBuffer = await Packer.toBuffer(doc)
  return Buffer.from(nodeBuffer)
}
