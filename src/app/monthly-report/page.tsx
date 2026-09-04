import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { computeMonthlyDailyStats } from '@/lib/monthly-daily-stats'
import { computeMonthlyChanges } from '@/lib/monthly-changes'
import { SERVICE_TIME_CATEGORY_LABELS } from '@/types/database'
import MonthlyDailyTable from './daily-table'
import MonthlyChangesTable from './changes-table'
import {
  computeFacilityOperationsOverview,
  fiscalYearOf,
  type Metrics,
  type MonthSummary,
} from '@/lib/facility-operations-stats'
import CapacityForm from './capacity-form'
import MonthPicker from './month-picker'
import PrintButton from '@/app/analytics/print-button'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function jstToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function jstNowLabel() {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

/** 「YYYY-MM」を diff か月ずらす */
function shiftMonth(ym: string, diff: number) {
  const d = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(5, 7)) - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOf(ym: string) {
  const d = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(5, 7)), 0)
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 選べる月の一覧（新しい順）。
 * 記録が1件も無い施設でも今月は選べるようにしておく
 */
async function selectableMonths(facilityId: string, currentMonth: string): Promise<string[]> {
  const { data: residents } = await supabase.from('Resident').select('id').eq('facilityId', facilityId)
  const ids = (residents ?? []).map(r => r.id)

  let earliest = currentMonth
  if (ids.length > 0) {
    const { data } = await supabase
      .from('DailyRecord').select('date').in('residentId', ids)
      .order('date', { ascending: true }).limit(1).maybeSingle()
    if (data?.date && data.date.slice(0, 7) < currentMonth) earliest = data.date.slice(0, 7)
  }

  const months: string[] = []
  for (let ym = currentMonth; ym >= earliest; ym = shiftMonth(ym, -1)) months.push(ym)
  return months
}

function fmtRate(rate: number | null) {
  return rate != null ? `${rate}%` : '未設定'
}

function fmtAvg(avg: number | null) {
  return avg != null ? `${avg}人` : '-'
}

function MetricRows({ metrics, muted }: { metrics: Metrics; muted?: boolean }) {
  const items = [
    { label: '単純稼働率', value: fmtRate(metrics.occupancyRate), strong: true },
    { label: '実質稼働率', value: fmtRate(metrics.effectiveOccupancyRate), strong: true },
    { label: '平均延べ利用者数', value: fmtAvg(metrics.avgDailyVisits) },
    { label: '営業日数', value: `${metrics.businessDays}日` },
    { label: '延べ利用者数', value: `${metrics.totalVisits}人（按分 ${metrics.weightedVisits}）` },
  ]
  return (
    <dl className="flex flex-col gap-1">
      {items.map(item => (
        <div key={item.label} className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-500">{item.label}</dt>
          <dd
            className={`${item.strong ? 'text-lg font-bold' : 'text-sm font-medium'} ${
              muted ? 'text-gray-500' : item.strong ? 'text-teal-700' : 'text-gray-700'
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function MonthCard({
  summary,
  caption,
  mode,
}: {
  summary: MonthSummary
  caption: string
  mode: 'actual' | 'partial' | 'forecast'
}) {
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm p-4 print-block print-keep ${
        mode === 'partial' ? 'border-teal-300' : 'border-gray-200'
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">
          {summary.year}年{summary.month}月
        </h4>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            mode === 'forecast' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {caption}
        </span>
      </div>

      {mode === 'forecast' ? (
        <MetricRows metrics={summary.forecast!} />
      ) : (
        <MetricRows metrics={summary.actual} />
      )}

      {mode === 'partial' && summary.forecast && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          <p className="text-[10px] text-amber-700 mb-1">月末見込み</p>
          <MetricRows metrics={summary.forecast} muted />
        </div>
      )}
    </div>
  )
}

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireSession()
  const today = jstToday()
  const currentMonth = today.slice(0, 7)

  const months = await selectableMonths(session.facilityId, currentMonth)
  const { month: monthParam = '' } = await searchParams
  const selectedMonth = months.includes(monthParam) ? monthParam : currentMonth
  const isCurrentMonth = selectedMonth === currentMonth

  // 過ぎた月は、その月の末日時点で集計する（今月は本日時点）
  const asOf = isCurrentMonth ? today : lastDayOf(selectedMonth)

  const overview = await computeFacilityOperationsOverview(session.facilityId, asOf)
  const year = parseInt(selectedMonth.slice(0, 4))
  const month = parseInt(selectedMonth.slice(5, 7))
  const dailyStats = await computeMonthlyDailyStats(session.facilityId, year, month)
  const changes = await computeMonthlyChanges(session.facilityId, year, month, asOf)
  const { composition } = overview

  // 「前月・当月・翌月」は、選んだ月ではなく今日を基準に実績か予測かが決まる
  const modeOf = (ym: string): 'actual' | 'partial' | 'forecast' =>
    ym < currentMonth ? 'actual' : ym === currentMonth ? 'partial' : 'forecast'
  const captionOf = (mode: 'actual' | 'partial' | 'forecast') =>
    mode === 'actual' ? '実績' : mode === 'partial' ? '実績（本日まで）' : '予測'
  const ymOf = (s: MonthSummary) => `${s.year}-${String(s.month).padStart(2, '0')}`

  // 翌月のカードは予測を出すためのもの。実績は集計していないので、
  // 過ぎた月を見ているとき（＝その翌月も過去）は出さない
  const monthCards = isCurrentMonth
    ? [overview.prevMonth, overview.currentMonth, overview.nextMonth]
    : [overview.prevMonth, overview.currentMonth]

  const nowFiscalYear = fiscalYearOf(today)
  const fiscalYearLabel = (fy: number) =>
    fy === nowFiscalYear ? '今年度' : fy === nowFiscalYear - 1 ? '前年度' : `${fy}年度`

  const registeredCategoryCounts: Record<string, number> = {}
  composition.categories.forEach((cat, i) => {
    if (composition.columnTotals[i] > 0) registeredCategoryCounts[cat] = composition.columnTotals[i]
  })

  const fiscalYears = [
    { ...overview.currentFiscalYear, label: fiscalYearLabel(overview.currentFiscalYear.fiscalYear) },
    { ...overview.previousFiscalYear, label: fiscalYearLabel(overview.previousFiscalYear.fiscalYear) },
  ]

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body { background: white; }
          .print-block { box-shadow: none; }
          /* 高さのある枠（日別の利用状況・入退院の一覧）は、途中で改ページできるようにする。
             枠ごと次のページへ送ると、手前のページが大きく空いてしまうため */
          .print-keep { break-inside: avoid; page-break-inside: avoid; }
          /* 見出しだけがページ末に取り残されないようにする */
          h3, h4 { break-after: avoid; }
          /* 表は行の途中で切らない。見出し行は各ページの先頭で繰り返す */
          .print-block tr { break-inside: avoid; }
          .print-block thead { display: table-header-group; }
        }
      `}</style>

      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h2 className="text-lg font-bold text-gray-800">月次報告</h2>
          <p className="text-sm text-gray-500">
            {monthLabel(selectedMonth)}
            {isCurrentMonth ? `（${today.replace(/-/g, '/')} 時点）` : '（確定）'} ・ 営業曜日{' '}
            {overview.operatingDows.map(d => DOW[d]).join('・') || '-'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker months={months} selected={selectedMonth} />
          <PrintButton />
        </div>
      </div>

      {/* 印刷用ヘッダー（画面には非表示） */}
      <div className="hidden print:block print:mb-3">
        <h1 className="text-lg font-bold text-gray-900">
          {session.facilityName}　月次報告（{monthLabel(selectedMonth)}）
        </h1>
        <p className="text-xs text-gray-600 mt-1">
          {isCurrentMonth ? `${today.replace(/-/g, '/')} 時点` : '確定'} ・ 営業曜日{' '}
          {overview.operatingDows.map(d => DOW[d]).join('・') || '-'}
        </p>
        <p className="text-[10px] text-gray-400">印刷日時: {jstNowLabel()}</p>
      </div>

      {/* 定員が無いと稼働率がすべて「未設定」になり、この画面が数字として機能しない */}
      {overview.capacity == null && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 print:hidden">
          <p className="text-sm font-semibold text-amber-900">定員が未設定です。</p>
          <p className="text-xs text-amber-800 mt-0.5">
            単純稼働率・実質稼働率は「延べ利用者数 ÷（定員 × 営業日数）」で計算するため、
            定員が入るまで稼働率と年度サマリーは「未設定」と表示されます。
            {isCurrentMonth ? '下の定員設定から入力してください。' : '今月の画面から入力できます。'}
          </p>
        </div>
      )}

      {/* 定員は施設の設定なので、過ぎた月を見ているときは触らせない */}
      {isCurrentMonth && (
        <div className="print:hidden">
          <CapacityForm
            facility={{ capacity: overview.capacity, capacityByCategory: overview.capacityByCategory }}
            registeredCategoryCounts={registeredCategoryCounts}
          />
        </div>
      )}

      {/* 稼働率。何人に対する割合なのかが分かるよう、見出しにこの事業所の定員を出す */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          稼働率
          <span className="text-xs font-normal text-gray-500 ml-2">
            {overview.capacity != null ? `定員${overview.capacity}名` : '定員未設定'}
          </span>
        </h3>
        <div className={`grid grid-cols-1 gap-3 ${
          monthCards.length === 3 ? 'sm:grid-cols-3 print:grid-cols-3' : 'sm:grid-cols-2 print:grid-cols-2'
        }`}>
          {monthCards.map(summary => {
            const mode = modeOf(ymOf(summary))
            return <MonthCard key={ymOf(summary)} summary={summary} caption={captionOf(mode)} mode={mode} />
          })}
        </div>
        {isCurrentMonth && (
          <p className="text-[10px] text-gray-400 mt-2">
            予測は、利用者マスタの利用曜日と直近3か月の営業曜日・実績出席率（予定に対して
            {Math.round(overview.forecastRatio * 100)}%）をもとに算出した目安です。祝日等の臨時休業は反映されません。
          </p>
        )}
      </div>

      {/* 年度サマリー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print-block print-keep">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">年度サマリー（4月〜3月）</h3>
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5 font-medium whitespace-nowrap">年度</th>
                <th className="text-right py-1.5 font-medium whitespace-nowrap px-2">単純稼働率</th>
                <th className="text-right py-1.5 font-medium whitespace-nowrap px-2">実質稼働率</th>
                <th className="text-right py-1.5 font-medium whitespace-nowrap px-2">平均延べ利用者数</th>
                <th className="text-right py-1.5 font-medium whitespace-nowrap px-2">営業日数</th>
                <th className="text-right py-1.5 font-medium whitespace-nowrap pl-2">延べ利用者数</th>
              </tr>
            </thead>
            <tbody>
              {fiscalYears.map(fy => (
                <tr key={fy.fiscalYear} className="border-b border-gray-50">
                  <td className="py-2 whitespace-nowrap">
                    {fy.label}
                    <span className="text-xs text-gray-400 ml-1">
                      （{fy.fiscalYear}年度
                      {fy.inProgress ? (isCurrentMonth ? '・本日まで' : `・${monthLabel(selectedMonth)}末まで`) : ''}）
                    </span>
                  </td>
                  <td className="py-2 text-right px-2 font-medium text-gray-700">
                    {fmtRate(fy.metrics.occupancyRate)}
                  </td>
                  <td className="py-2 text-right px-2 font-medium text-teal-700">
                    {fmtRate(fy.metrics.effectiveOccupancyRate)}
                  </td>
                  <td className="py-2 text-right px-2">{fmtAvg(fy.metrics.avgDailyVisits)}</td>
                  <td className="py-2 text-right px-2">{fy.metrics.businessDays}日</td>
                  <td className="py-2 text-right pl-2">
                    {fy.metrics.totalVisits}人
                    <span className="text-xs text-gray-400 ml-1">（按分 {fy.metrics.weightedVisits}）</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-gray-400 mt-2 flex flex-col gap-0.5">
          <p>
            按分：5時間以上=1.0人／3時間以上5時間未満=0.5人／3時間未満=0人（利用時間区分が未設定の場合は提供時刻から判定し、それも無ければ1.0人として計算）
          </p>
          <p>単純稼働率 = 延べ利用者数（実人数）÷（定員 × 営業日数）</p>
          <p>実質稼働率 = 按分後の延べ利用者数 ÷（定員 × 営業日数）</p>
          <p>平均延べ利用者数 = 按分後の延べ利用者数 ÷ 営業日数（1日あたり）</p>
          <p>稼働率は現在の定員設定をもとに算出しています。</p>
        </div>
      </div>

      {/* 介護度 × 利用時間 の構成 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print-block print-keep">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">介護度 × 利用時間 の構成</h3>
        <p className="text-[10px] text-gray-400 mb-3">
          {isCurrentMonth ? '本日' : `${monthLabel(selectedMonth)}末`}
          時点で利用期間中の方を、介護度と利用時間区分で集計しています（利用開始前・利用終了後の方は含みません）。「按分後」は
          5時間以上=1.0人／3時間以上5時間未満=0.5人／3時間未満=0人 で換算した人数です
          {!isCurrentMonth && '。介護度と利用時間区分は現在の登録内容で数えています'}
        </p>
        {composition.grandTotal === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">在籍中の利用者が登録されていません</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 font-medium whitespace-nowrap">介護度</th>
                  {composition.categories.map((cat, i) => (
                    <th key={cat} className="text-right py-1.5 font-medium whitespace-nowrap px-2">
                      {SERVICE_TIME_CATEGORY_LABELS[cat] ?? cat}
                      <span className="block text-[10px] text-gray-300 font-normal">
                        ×{composition.categoryWeights[i].toFixed(1)}
                      </span>
                    </th>
                  ))}
                  <th className="text-right py-1.5 font-medium whitespace-nowrap pl-2">合計</th>
                </tr>
              </thead>
              <tbody>
                {composition.rows.map(row => (
                  <tr key={row.careLevel} className="border-b border-gray-50">
                    <td className="py-1.5 whitespace-nowrap">{row.careLevel}</td>
                    {row.counts.map((n, i) => (
                      <td
                        key={composition.categories[i]}
                        className={`py-1.5 text-right px-2 ${n === 0 ? 'text-gray-300' : ''}`}
                      >
                        {n}
                      </td>
                    ))}
                    <td className="py-1.5 text-right pl-2 font-medium">{row.total}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50">
                  <td className="py-2 whitespace-nowrap">合計</td>
                  {composition.columnTotals.map((n, i) => (
                    <td key={composition.categories[i]} className="py-2 text-right px-2">
                      {n}
                    </td>
                  ))}
                  <td className="py-2 text-right pl-2">{composition.grandTotal}</td>
                </tr>
                <tr className="text-xs text-gray-500 bg-gray-50">
                  <td className="py-2 whitespace-nowrap">按分後</td>
                  {composition.weightedColumnTotals.map((n, i) => (
                    <td key={composition.categories[i]} className="py-2 text-right px-2">
                      {n}
                    </td>
                  ))}
                  <td className="py-2 text-right pl-2 font-semibold text-gray-700">
                    {composition.weightedGrandTotal}
                  </td>
                </tr>
                <tr className="text-xs text-gray-500">
                  <td className="py-2 whitespace-nowrap">定員</td>
                  {composition.columnCapacities.map((cap, i) => (
                    <td
                      key={composition.categories[i]}
                      className={`py-2 text-right px-2 ${
                        composition.columnCapacityIsAuto[i] ? 'text-teal-600' : ''
                      }`}
                    >
                      {cap != null ? cap : '-'}
                      {composition.columnCapacityIsAuto[i] && <span className="text-[10px]">*</span>}
                    </td>
                  ))}
                  <td className="py-2 text-right pl-2">{composition.capacity ?? '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {composition.columnCapacityIsAuto.some(Boolean) && (
          <p className="text-[10px] text-teal-600 mt-2">
            * 定員が未設定の区分は、利用者登録の在籍者数を定員として自動反映しています（定員設定で数値を入力すると、その値が優先されます）
          </p>
        )}
      </div>

      {/* 日別の利用状況 */}
      <MonthlyDailyTable stats={dailyStats} />

      {/* 当月の入院・利用中止・新規利用開始 */}
      <MonthlyChangesTable changes={changes} isCurrentMonth={isCurrentMonth} />

    </div>
  )
}
