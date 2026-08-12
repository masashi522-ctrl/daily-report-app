import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { generateCareReport } from '@/app/analytics/actions'
import { computeResidentMonthlyStats } from '@/lib/monthly-report-stats'
import { buildBulkCareReportWord } from '@/lib/care-report-word'

export async function GET(request: Request) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? '')
  const month = parseInt(searchParams.get('month') ?? '')
  const residentIdsParam = searchParams.get('residentIds') ?? ''
  const residentIds = residentIdsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (!year || !month || residentIds.length === 0) {
    return new Response('year, month, residentIds is required', { status: 400 })
  }

  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name')
    .in('id', residentIds)
    .eq('facilityId', session.facilityId)
  const residents = residentsRaw ?? []
  if (residents.length === 0) return new Response('Resident not found', { status: 404 })

  const orderedResidents = residentIds
    .map(id => residents.find(r => r.id === id))
    .filter((r): r is { id: string; name: string } => !!r)

  const reports = await Promise.all(
    orderedResidents.map(async resident => {
      const stats = await computeResidentMonthlyStats(resident.id, resident.name, year, month)
      if (!stats) {
        return { residentName: resident.name, reportText: `${year}年${month}月の記録がないため、報告書を作成できませんでした。` }
      }
      const reportText = await generateCareReport(stats)
      return { residentName: resident.name, reportText }
    }),
  )

  const buffer = await buildBulkCareReportWord(reports, year, month)
  const filenameBase = orderedResidents.length === 1 ? orderedResidents[0].name : `${orderedResidents.length}名`
  const filename = `月次報告書_${filenameBase}_${year}年${month}月.docx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
