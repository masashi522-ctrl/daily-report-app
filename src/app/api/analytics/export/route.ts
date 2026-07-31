import { requireSession } from '@/lib/session'
import { buildAnalyticsReportData } from '@/lib/analytics-report-data'
import { buildAnalyticsReportPdf } from '@/lib/analytics-report-pdf'
import { buildAnalyticsReportWord } from '@/lib/analytics-report-word'

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const residentId = searchParams.get('residentId') || ''
  const format = searchParams.get('format') === 'word' ? 'word' : 'pdf'

  const data = await buildAnalyticsReportData(year, month, residentId)

  if (format === 'word') {
    const buffer = await buildAnalyticsReportWord(data)
    const filename = `デイサービス集計_${year}年${month}月_${data.targetName}.docx`
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  }

  const buffer = await buildAnalyticsReportPdf(data)
  const filename = `デイサービス集計_${year}年${month}月_${data.targetName}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
