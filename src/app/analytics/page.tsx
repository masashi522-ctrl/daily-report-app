import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ResidentReport, { type ChartData } from './resident-report'
import type { ReportStats } from './actions'
import AnalyticsFilter from './analytics-filter'

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

  const { data: residentsRaw } = await supabase
    .from('Resident').select('id, name, furigana').eq('isActive', true).eq('facilityId', session.facilityId)
  const residents = (residentsRaw ?? []).sort((a, b) =>
    (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja')
  )
  const facilityResidentIds = residents.map(r => r.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let records: any[] = []
  if (facilityResidentIds.length > 0) {
    let query = supabase.from('DailyRecord').select('*').gte('date', from).lte('date', to).in('residentId', facilityResidentIds)
    if (residentId) query = query.eq('residentId', residentId)
    const { data } = await query
    records = data ?? []
  }

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

  const total = records?.length ?? 0
  const r = records ?? []

  const stats = {
    bpSystolicAm:    avg(r.map(x => x.bpSystolic)),
    bpSystolicPm:    avg(r.map(x => x.bpSystolicPm)),
    bpSystolicAll:   avgCombined(r.map(x => x.bpSystolic), r.map(x => x.bpSystolicPm)),
    bpDiastolicAm:   avg(r.map(x => x.bpDiastolic)),
    bpDiastolicPm:   avg(r.map(x => x.bpDiastolicPm)),
    bpDiastolicAll:  avgCombined(r.map(x => x.bpDiastolic), r.map(x => x.bpDiastolicPm)),
    pulseAm:         avg(r.map(x => x.pulse)),
    pulsePm:         avg(r.map(x => x.pulsePm)),
    pulseAll:        avgCombined(r.map(x => x.pulse), r.map(x => x.pulsePm)),
    tempAm:          avg(r.map(x => x.tempMorning)),
    tempPm:          avg(r.map(x => x.tempAfternoon)),
    tempAll:         avgCombined(r.map(x => x.tempMorning), r.map(x => x.tempAfternoon)),
    fluidAm:         avg(r.map(x => x.fluidIntakeAm)),
    fluidPm:         avg(r.map(x => x.fluidIntakePm)),
    fluidAll:        avgCombined(r.map(x => x.fluidIntakeAm), r.map(x => x.fluidIntakePm)),
    mealMain:        avg(r.map(x => x.mealMainFood)),
    mealSide:        avg(r.map(x => x.mealSideFood)),
    bathing:         `${countOf(r.map(x => x.bathing === 'DONE'))}/${total}回`,
    oralCare:        `${countOf(r.map(x => x.oralCare))}/${total}回`,
    medMorning:      `${countOf(r.map(x => x.medicationMorning))}/${total}回`,
    medLunch:        `${countOf(r.map(x => x.medicationBeforeLunch || x.medicationAfterLunch))}/${total}回`,
    medEvening:      `${countOf(r.map(x => x.medicationEvening))}/${total}回`,
    training:        `${countOf(r.map(x => x.trainingDone))}/${total}回`,
  }

  const groups = [
    {
      title: '血圧（収縮期）', unit: 'mmHg',
      rows: [
        { label: 'AM', value: stats.bpSystolicAm },
        { label: 'PM', value: stats.bpSystolicPm },
        { label: 'AM+PM合算', value: stats.bpSystolicAll, highlight: true },
      ],
    },
    {
      title: '血圧（拡張期）', unit: 'mmHg',
      rows: [
        { label: 'AM', value: stats.bpDiastolicAm },
        { label: 'PM', value: stats.bpDiastolicPm },
        { label: 'AM+PM合算', value: stats.bpDiastolicAll, highlight: true },
      ],
    },
    {
      title: '脈拍', unit: '回/分',
      rows: [
        { label: 'AM', value: stats.pulseAm },
        { label: 'PM', value: stats.pulsePm },
        { label: 'AM+PM合算', value: stats.pulseAll, highlight: true },
      ],
    },
    {
      title: '体温', unit: '℃',
      rows: [
        { label: 'AM', value: stats.tempAm },
        { label: 'PM', value: stats.tempPm },
        { label: 'AM+PM合算', value: stats.tempAll, highlight: true },
      ],
    },
    {
      title: '水分摂取', unit: 'ml',
      rows: [
        { label: 'AM', value: stats.fluidAm },
        { label: 'PM', value: stats.fluidPm },
        { label: 'AM+PM合算', value: stats.fluidAll, highlight: true },
      ],
    },
    {
      title: '食事量（月平均）', unit: '割',
      rows: [
        { label: '主食', value: stats.mealMain },
        { label: '主菜', value: stats.mealSide },
      ],
    },
  ]

  const counts = [
    { label: '入浴 実施',    value: stats.bathing },
    { label: '機能訓練 実施', value: stats.training },
    { label: '口腔ケア',     value: stats.oralCare },
    { label: '朝薬',        value: stats.medMorning },
    { label: '昼薬',        value: stats.medLunch },
    { label: '夕薬',        value: stats.medEvening },
  ]

  const targetName = residentId
    ? residents?.find(x => x.id === residentId)?.name ?? '不明'
    : '全利用者'

  // 個人選択時：グラフ用の日別データとAIレポート用統計を計算
  let chartData: ChartData | null = null
  let reportStats: ReportStats | null = null

  if (residentId && r.length > 0) {
    const allDays = Array.from({ length: lastDay }, (_, i) => i + 1)
    const byDay = new Map<number, typeof r[0]>()
    for (const rec of r) {
      const day = parseInt(rec.date.split('-')[2])
      byDay.set(day, rec)
    }

    chartData = {
      days: allDays,
      bpSys:  allDays.map(d => byDay.get(d)?.bpSystolic ?? null),
      bpDia:  allDays.map(d => byDay.get(d)?.bpDiastolic ?? null),
      temp:   allDays.map(d => byDay.get(d)?.tempMorning ?? null),
      fluid:  allDays.map(d => {
        const rec = byDay.get(d)
        if (!rec) return null
        const am = rec.fluidIntakeAm ?? 0
        const pm = rec.fluidIntakePm ?? 0
        return (am > 0 || pm > 0) ? am + pm : null
      }),
      meal:   allDays.map(d => byDay.get(d)?.mealMainFood ?? null),
    }

    const attendingRecs = r.filter(x => !x.isAbsent)
    const bathingCount = countOf(r.map(x => x.bathing === 'DONE'))

    const weightValues = r.map(x => x.weight).filter((v): v is number => v != null && v > 0)

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
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-gray-800">集計・分析</h2>

      {/* フィルター */}
      <AnalyticsFilter
        residents={residents}
        residentId={residentId}
        year={year}
        month={month}
        total={total}
      />

      {/* バイタル系グループ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(group => (
          <div key={group.title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">
              {group.title} <span className="text-xs font-normal text-gray-400">月平均</span>
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

      <p className="text-xs text-gray-400">{year}年{month}月 / 対象: {targetName}</p>
    </div>
  )
}
