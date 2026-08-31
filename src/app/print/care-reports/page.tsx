import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { residentIdsInFacility } from '@/lib/facility-guard'
import { computeReportStats, fetchCarePlanSummary } from '@/lib/care-report-stats'
import { buildVitalCards, buildChartData, loadResidentPhotos, loadWeightTrend, CARDS_WITHOUT_CHART } from '@/lib/analytics-view'
import ResidentReport from '@/app/analytics/resident-report'
import CareReportsPrintActions from './print-actions'

// 選んだ利用者の月次報告書を、利用者月次報告の個別印刷と同じ内容で続けて印刷する画面。
// 中身（集計カード・グラフ・報告書・特記事項・写真）は個別印刷と同じ部品を使っているため、
// どちらか一方だけ見た目がずれることはない。

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function CareReportsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; ids?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams

  const now = new Date()
  const year = Number(params.year) || now.getFullYear()
  const month = Number(params.month) || now.getMonth() + 1

  // 他施設の利用者を指定されても出さない
  const requestedIds = (params.ids ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const allowed = await residentIdsInFacility(requestedIds, session.facilityId)
  const ids = requestedIds.filter(id => allowed.has(id))

  const backHref = `/analytics?year=${year}&month=${month}`

  if (ids.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CareReportsPrintActions count={0} backHref={backHref} />
        <p className="text-sm text-gray-500 text-center py-20">
          印刷する利用者が選ばれていません。利用者月次報告の「月次報告書をまとめて作成」でお名前を選んでから、もう一度お試しください。
        </p>
      </div>
    )
  }

  const mm = String(month).padStart(2, '0')
  const from = `${year}-${mm}-01`
  const to = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // 記録・氏名・報告書は人数分まとめて読む
  const [{ data: residentRows }, { data: recordRows }, { data: reportRows }, { data: facility }] = await Promise.all([
    supabase.from('Resident').select('id, name').in('id', ids),
    supabase.from('DailyRecord').select('*').in('residentId', ids).gte('date', from).lte('date', to),
    supabase.from('CareReport').select('residentId, body').eq('year', year).eq('month', month).in('residentId', ids),
    supabase.from('Facility').select('name').eq('id', session.facilityId).maybeSingle(),
  ])

  const nameById = new Map((residentRows ?? []).map(r => [r.id, r.name as string]))
  const bodyById = new Map((reportRows ?? []).map(r => [r.residentId as string, r.body as string]))
  const recordsById = new Map<string, any[]>()
  for (const rec of recordRows ?? []) {
    if (!recordsById.has(rec.residentId)) recordsById.set(rec.residentId, [])
    recordsById.get(rec.residentId)!.push(rec)
  }

  const sheets = await Promise.all(ids.map(async id => {
    const records = recordsById.get(id) ?? []
    const name = nameById.get(id) ?? '（不明）'
    const [carePlan, photos, weightTrend] = await Promise.all([
      fetchCarePlanSummary(id),
      loadResidentPhotos(id, year, month),
      loadWeightTrend(id, year, month),
    ])
    return {
      id,
      name,
      records,
      photos,
      weightTrend,
      body: bodyById.get(id) ?? '',
      cards: buildVitalCards(records, month).filter(c => CARDS_WITHOUT_CHART.includes(c.title)),
      chartData: buildChartData(records, year, month),
      stats: computeReportStats(name, year, month, records, carePlan),
    }
  }))

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white print:min-h-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body { background: white; }
          .resident-sheet { break-after: page; page-break-after: always; }
          .resident-sheet:last-child { break-after: auto; page-break-after: auto; }
          .resident-sheet svg { break-inside: avoid; page-break-inside: avoid; }
          .print\:break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; border: none; }
        }
      `}</style>

      <CareReportsPrintActions count={sheets.length} backHref={backHref} />

      <div className="max-w-[210mm] mx-auto my-6 flex flex-col gap-6 print:my-0 print:gap-0">
        {sheets.map(sheet => (
          <div key={sheet.id} className="resident-sheet sheet bg-white shadow-sm border border-gray-200 p-8 print:p-0">
            <div className="border-b-2 border-gray-800 pb-2 mb-4">
              <div className="flex items-end justify-between">
                <div>
                  <h1 className="text-lg font-bold text-gray-900">月次報告書</h1>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{sheet.name} 様</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{year}年{month}月</p>
                  <p className="text-xs text-gray-500">{facility?.name ?? ''}　/　記録{sheet.records.length}件</p>
                </div>
              </div>
            </div>

            {/* グラフを持たない項目だけカードで出す（今は該当なし） */}
            {sheet.cards.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 print:border-0 print:p-0 print:mb-3 print:break-inside-avoid">
              <div className="grid grid-cols-2 gap-4">
                {sheet.cards.map(card => (
                  <div key={card.title}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1.5">
                      {card.title} <span className="text-xs font-normal text-gray-400">{month}月推移</span>
                    </h3>
                    <div className="flex flex-col gap-1.5">
                      {card.rows.map(row => (
                        <div key={row.label} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${row.highlight ? 'bg-blue-50' : 'bg-gray-50'}`}>
                          <span className={`text-xs ${row.highlight ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>{row.label}</span>
                          <span className={`font-bold ${row.highlight ? 'text-blue-700 text-lg' : 'text-gray-700'}`}>
                            {row.value}
                            {row.value !== '-' && <span className="text-xs font-normal text-gray-400 ml-1">{card.unit}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {sheet.body ? null : (
              <p className="text-sm text-gray-500 mb-3">この月の月次報告書はまだ作成されていません。</p>
            )}

            <ResidentReport
              stats={sheet.stats}
              chartData={sheet.chartData}
              residentId={sheet.id}
              year={year}
              month={month}
              photos={sheet.photos}
              savedReport={sheet.body}
              weightTrend={sheet.weightTrend}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
