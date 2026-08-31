import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ResidentReport, { type ChartData } from './resident-report'
import type { ResidentPhoto } from './photo-gallery'
import type { ReportStats, CarePlanSummary } from './actions'
import AnalyticsFilter from './analytics-filter'
import BatchReport from './batch-report'
import { listSavedReportIds, getSavedReport } from './report-actions'
import PrintButton from './print-button'
import { overlapsServicePeriod } from '@/lib/service-period'
import { buildVitalCards, buildChartData, loadResidentPhotos, loadWeightTrend, CARDS_WITHOUT_CHART, type WeightTrend } from '@/lib/analytics-view'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; year?: string; month?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams

  const now = new Date()
  const year = parseInt(params.year || String(now.getFullYear()))
  const month = parseInt(params.month || String(now.getMonth() + 1))
  const residentId = params.residentId || ''

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // 集計対象はその月に在籍していた方なので、現在の在籍状況では絞り込まない。
  // 施設の全利用者を読み、記録の取得範囲を自施設に限るためにIDを使う
  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana, isActive, serviceStartDate, serviceEndDate')
    .eq('facilityId', session.facilityId)
  const facilityResidentIds = (residentsRaw ?? []).map(r => r.id)

  // その月の記録。月の途中で利用を終えた方の記録も、利用日までは集計に入れる
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monthRecords: any[] = []
  if (facilityResidentIds.length > 0) {
    const { data } = await supabase.from('DailyRecord').select('*')
      .gte('date', from).lte('date', to).in('residentId', facilityResidentIds)
    monthRecords = data ?? []
  }
  const recordedIds = new Set(monthRecords.map(x => x.residentId))

  // 選べる利用者：その月に記録がある方と、その月に在籍していた在籍中の方
  const residents = (residentsRaw ?? [])
    .filter(r => recordedIds.has(r.id) || (r.isActive && overlapsServicePeriod(r, from, to)))
    .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'))

  const records = residentId ? monthRecords.filter(x => x.residentId === residentId) : monthRecords

  // まとめて作成する対象は「その月に記録がある方」に限る。
  // 利用開始日が未設定の利用者が多く、在籍中というだけでは翌月から利用開始の方まで並んでしまうため。
  const batchResidents = residents
    .filter(r => recordedIds.has(r.id) && overlapsServicePeriod(r, from, to))
    .map(r => ({ id: r.id, name: r.name }))

  // 月次報告書の作成状況（まとめて作成パネルの表示と、選択中の利用者の保存済み本文）
  const savedReportIds = await listSavedReportIds(year, month)
  const savedReport = residentId ? await getSavedReport(residentId, year, month) : null

  function avg(arr: (number | null | undefined)[]) {
    const valid = arr.filter((v): v is number => v != null)
    return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-'
  }
  function avgNum(arr: (number | null | undefined)[]): number | null {
    const valid = arr.filter((v): v is number => v != null)
    return valid.length ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)) : null
  }
  function avgCombined(a: (number | null | undefined)[], b: (number | null | undefined)[]) {
    return avg([...a, ...b])
  }
  function countOf(arr: boolean[]) { return arr.filter(Boolean).length }

  const total = records.length
  const r = records

  const stats = {
    bpSystolicAll:   avgCombined(r.map(x => x.bpSystolic), r.map(x => x.bpSystolicPm)),
    bpDiastolicAll:  avgCombined(r.map(x => x.bpDiastolic), r.map(x => x.bpDiastolicPm)),
    pulseAll:        avgCombined(r.map(x => x.pulse), r.map(x => x.pulsePm)),
    tempAll:         avgCombined(r.map(x => x.tempMorning), r.map(x => x.tempAfternoon)),
    fluidAll:        avgCombined(r.map(x => x.fluidIntakeAm), r.map(x => x.fluidIntakePm)),
    mealMain:        avg(r.map(x => x.mealMainFood)),
    mealSide:        avg(r.map(x => x.mealSideFood)),
    weight:          avg(r.map(x => (x.weight != null && x.weight > 0) ? x.weight : null)),
    bathing:         `${countOf(r.map(x => x.bathing === 'DONE'))}/${total}回`,
    training:        `${countOf(r.map(x => x.trainingDone))}/${total}回`,
  }

  // 利用者を選んでいるときは、血圧・体温・水分・体重の平均をグラフの見出しに出すため、ここでは重ねない
  const allCards = buildVitalCards(records, month)
  const groups = residentId ? allCards.filter(c => CARDS_WITHOUT_CHART.includes(c.title)) : allCards

  const counts = [
    { label: '入浴 実施',    value: stats.bathing },
    { label: '機能訓練 実施', value: stats.training },
  ]

  const targetName = residentId
    ? residents?.find(x => x.id === residentId)?.name ?? '不明'
    : '全利用者'

  // 個人選択時：グラフ用の日別データとAIレポート用統計を計算
  let chartData: ChartData | null = null
  let reportStats: ReportStats | null = null
  let photos: ResidentPhoto[] = []
  let weightTrend: WeightTrend = { months: [], change: null, points: [], ticks: [] }

  if (residentId && r.length > 0) {
    chartData = buildChartData(r, year, month)

    const attendingRecs = r.filter(x => !x.isAbsent)
    const bathingCount = countOf(r.map(x => x.bathing === 'DONE'))

    const weightValues = r.map(x => x.weight).filter((v): v is number => v != null && v > 0)

    const careNotes = [...r]
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap(x => [
        x.specialNotes?.trim() ? { date: x.date, label: '特記事項', text: x.specialNotes.trim() } : null,
        x.bathingNote?.trim() ? { date: x.date, label: '入浴', text: x.bathingNote.trim() } : null,
        x.trainingNote?.trim() ? { date: x.date, label: '機能訓練', text: x.trainingNote.trim() } : null,
        // 備考欄は特記事項に統合済み。統合前の記録が残っている場合のみ拾う
        x.oralCareNote?.trim() ? { date: x.date, label: '備考', text: x.oralCareNote.trim() } : null,
        x.dailyNote?.trim() ? { date: x.date, label: 'その日の様子', text: x.dailyNote.trim() } : null,
      ])
      .filter((v): v is { date: string; label: string; text: string } => v !== null)

    // 画面表示・月次報告書への添付用：特記事項欄のみを日付順に抽出
    const dailyNotes = [...r]
      .filter(x => x.specialNotes?.trim())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(x => ({ date: x.date, text: x.specialNotes.trim() }))

    const serviceGaps = [...r]
      .filter(x => !x.isAbsent)
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap(x => {
        const events: { date: string; label: string; reason: string }[] = []
        if (x.bathing === 'NOT_DONE') {
          events.push({
            date: x.date,
            label: '入浴',
            reason: [x.bathingSkipReason, x.bathingSkipDetail].filter(Boolean).join('：') || '理由不明',
          })
        }
        if (x.trainingDone === false && (x.trainingSkipReason || x.trainingSkipDetail)) {
          events.push({
            date: x.date,
            label: '機能訓練',
            reason: [x.trainingSkipReason, x.trainingSkipDetail].filter(Boolean).join('：') || '理由不明',
          })
        }
        return events
      })

    const { data: carePlanRaw } = await supabase
      .from('CarePlan')
      .select('goalImage, goals')
      .eq('residentId', residentId)
      .maybeSingle()
    const carePlan: CarePlanSummary | null = carePlanRaw
      ? {
          goalImage: carePlanRaw.goalImage,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          goals: ((carePlanRaw.goals ?? []) as any[]).map(g => ({
            issue: g.issue ?? '',
            longTermGoal: g.longTermGoal ?? '',
            shortTermGoal: g.shortTermGoal ?? '',
          })),
        }
      : null

    reportStats = {
      residentName: targetName,
      year,
      month,
      attendanceCount: attendingRecs.length,
      absentCount: r.filter(x => x.isAbsent).length,
      bpSystolicAvg:  avgNum(r.map(x => x.bpSystolic)),
      bpDiastolicAvg: avgNum(r.map(x => x.bpDiastolic)),
      pulseAvg:       avgNum(r.map(x => x.pulse)),
      tempAvg:        avgNum(r.map(x => x.tempMorning)),
      fluidAvg:       avgNum(r.map(x => (x.fluidIntakeAm ?? 0) + (x.fluidIntakePm ?? 0))),
      mealMainAvg:    avgNum(r.map(x => x.mealMainFood)),
      mealSideAvg:    avgNum(r.map(x => x.mealSideFood)),
      bathingCount,
      attendanceForBathing: attendingRecs.length,
      trainingCount:  countOf(r.map(x => x.trainingDone)),
      oralCareCount:  countOf(r.map(x => x.oralCare)),
      weightAvg:          weightValues.length ? parseFloat((weightValues.reduce((a, b) => a + b, 0) / weightValues.length).toFixed(1)) : null,
      weightMin:          weightValues.length ? Math.min(...weightValues) : null,
      weightMax:          weightValues.length ? Math.max(...weightValues) : null,
      weightMeasureCount: weightValues.length,
      careNotes,
      dailyNotes,
      carePlan,
      serviceGaps,
    }

    photos = await loadResidentPhotos(residentId, year, month)
    // 体重は当月だけでは増減が読めないため、前々月からの3か月分を読む
    weightTrend = await loadWeightTrend(residentId, year, month)
  }

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print { body { background: white; } }
      `}</style>

      <div className="flex items-center justify-between gap-3 print:hidden">
        <h2 className="text-xl font-bold text-gray-800">利用者月次報告</h2>
        <PrintButton />
      </div>

      {/* 印刷用ヘッダー（画面には非表示） */}
      <div className="hidden print:block print:mb-3">
        <h1 className="text-lg font-bold text-gray-900">デイサービス 利用者月次報告</h1>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          対象：{targetName}
          <span className="text-base font-normal text-gray-600 ml-3">{year}年{month}月</span>
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {session.facilityName}　/　記録{total}件
        </p>
        <p className="text-[10px] text-gray-400">印刷日時: {new Date().toLocaleString('ja-JP')}</p>
      </div>

      {/* フィルター */}
      <div className="print:hidden">
        <AnalyticsFilter
          residents={residents}
          residentId={residentId}
          year={year}
          month={month}
          total={total}
        />
      </div>

      {/* 月次報告書をまとめて作成 */}
      <BatchReport
        residents={batchResidents}
        year={year}
        month={month}
        savedIds={savedReportIds}
        provider={process.env.ANTHROPIC_API_KEY ? 'claude' : 'groq'}
      />

      {/* バイタル系グループ（グラフのある項目はグラフ側に平均を出すため、ここには残らない） */}
      {groups.length > 0 && (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">
                {group.title} <span className="text-xs font-normal text-gray-400">{month}月推移</span>
              </h3>
              <div className="flex flex-col gap-2">
                {group.rows.map(row => (
                  <div key={row.label} className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.highlight ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <span className={`text-xs ${row.highlight ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>{row.label}</span>
                    <span className={`font-bold ${row.highlight ? 'text-blue-700 text-lg' : 'text-gray-700'}`}>
                      {row.value}
                      {row.value !== '-' && <span className="text-xs font-normal text-gray-400 ml-1">{group.unit}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ケア実施回数 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">ケア実施回数</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {counts.map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-700">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 個人別：グラフ・AIレポート */}
      {residentId && chartData && reportStats ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">
            {targetName} さんの月次詳細
            <span className="ml-2 text-xs font-normal text-gray-400">{year}年{month}月</span>
          </h3>
          <ResidentReport
            stats={reportStats}
            chartData={chartData}
            residentId={residentId}
            year={year}
            month={month}
            photos={photos}
            savedReport={savedReport?.body ?? ''}
            weightTrend={weightTrend}
          />
        </div>
      ) : residentId ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
          {year}年{month}月の記録がありません
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center">
          利用者を選択すると、月次推移グラフとAI月次報告書が表示されます
        </p>
      )}

      <p className="text-xs text-gray-400 print:hidden">{year}年{month}月 / 対象: {targetName}</p>
    </div>
  )
}
