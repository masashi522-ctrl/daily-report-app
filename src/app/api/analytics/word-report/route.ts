import { NextRequest, NextResponse } from 'next/server'
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx'
import { requireSession } from '@/lib/session'

interface WordReportRequest {
  reportText: string
  residentName: string
  year: number
  month: number
}

function parseReportSections(text: string): { header: string; body: string }[] {
  const parts = text.split(/(?=【[^】]+】)/)
  return parts
    .filter(p => p.trim())
    .map(p => {
      const match = p.match(/^【([^】]+)】\s*([\s\S]*)$/)
      if (match) return { header: `【${match[1]}】`, body: match[2].trim() }
      return { header: '', body: p.trim() }
    })
}

function pt(halfPoints: number) { return halfPoints }

export async function POST(req: NextRequest) {
  await requireSession()

  const { reportText, residentName, year, month }: WordReportRequest = await req.json()

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const sections = parseReportSections(reportText)

  const children: Paragraph[] = []

  // ── タイトル ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: pt(240), after: pt(120) },
      children: [
        new TextRun({
          text: '月次サービス利用報告書',
          bold: true,
          size: pt(52),
          font: 'MS Gothic',
        }),
      ],
    }),
  )

  // ── 年月 ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: pt(320) },
      children: [
        new TextRun({
          text: `${year}年${month}月度`,
          size: pt(32),
          font: 'MS Gothic',
        }),
      ],
    }),
  )

  // ── 基本情報テーブル ──
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '' })],
      spacing: { after: pt(80) },
    }),
  )
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `利用者氏名　　${residentName} 様`,
          bold: true,
          size: pt(28),
          font: 'MS Gothic',
        }),
      ],
      spacing: { after: pt(80) },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888' },
      },
    }),
  )
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `作成日　　${today}`,
          size: pt(22),
          color: '555555',
          font: 'MS Gothic',
        }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { after: pt(400) },
    }),
  )

  // ── 各セクション ──
  for (const section of sections) {
    if (section.header) {
      children.push(
        new Paragraph({
          spacing: { before: pt(280), after: pt(100) },
          children: [
            new TextRun({
              text: section.header,
              bold: true,
              size: pt(26),
              font: 'MS Gothic',
              color: '1a3c6e',
            }),
          ],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '1a3c6e' },
          },
        }),
      )
    }
    if (section.body) {
      // 段落内の改行に対応
      const lines = section.body.split('\n').filter(l => l.trim())
      for (const line of lines) {
        children.push(
          new Paragraph({
            spacing: { after: pt(120) },
            children: [
              new TextRun({
                text: line,
                size: pt(24),
                font: 'MS Gothic',
              }),
            ],
          }),
        )
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1700, right: 1700 },
          },
        },
        children,
      },
    ],
  })

  const nodeBuffer = await Packer.toBuffer(doc)
  const buffer = new Uint8Array(nodeBuffer)
  const filename = `月次報告書_${residentName}_${year}年${month}月.docx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
