import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { buildCareReportWord } from '@/lib/care-report-word'
import { buildCareReportPdf } from '@/lib/care-report-pdf'

interface CareReportExportRequest {
  format: 'pdf' | 'word'
  reportText: string
  residentName: string
  year: number
  month: number
}

export async function POST(req: NextRequest) {
  await requireSession()

  const { format, reportText, residentName, year, month }: CareReportExportRequest = await req.json()

  if (format === 'pdf') {
    const buffer = await buildCareReportPdf(reportText, residentName, year, month)
    const filename = `月次報告書_${residentName}_${year}年${month}月.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  }

  const buffer = await buildCareReportWord(reportText, residentName, year, month)
  const filename = `月次報告書_${residentName}_${year}年${month}月.docx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
