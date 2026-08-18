import { requireSession } from '@/lib/session'
import {
  computeFacilityOperationsOverview,
  type Metrics,
  type MonthSummary,
} from '@/lib/facility-operations-stats'
import CapacityForm from './capacity-form'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const CATEGORY_LABELS: Record<string, string> = {
  '3-4': '3〜4時間',
  '4-5': '4〜5時間',
  '5-6': '5〜6時間',
  '6-7': '6〜7時間',
  '7-8': '7〜8時間',
  '8-9': '8〜9時間',
}

function jstToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
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
      className={`bg-white rounded-xl border shadow-sm p-4 ${
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

export default async function MonthlyReportPage() {
  const session = await requireSession()
  const today = jstToday()
  const overview = await computeFacilityOperationsOverview(session.facilityId, today)
  const { composition } = overview

  const registeredCategoryCounts: Record<string, number> = {}
  composition.categories.forEach((cat, i) => {
    if (composition.columnTotals[i] > 0) registeredCategoryCounts[cat] = composition.columnTotals[i]
  })

  const fiscalYears = [
    { ...overview.currentFiscalYear, label: '今年度' },
    { ...overview.previousFiscalYear, label: '前年度' },
  ]

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">月次報告</h2>
        <p className="text-sm text-gray-500">
          {today.replace(/-/g, '/')} 時点 ・ 営業曜日{' '}
          {overview.operatingDows.map(d => DOW[d]).join('・') || '-'}
        </p>
      </div>

      <CapacityForm
        facility={{ capacity: overview.capacity, capacityByCategory: overview.capacityByCategory }}
        registeredCategoryCounts={registeredCategoryCounts}
      />

      {/* 介護度 × 利用時間 の構成 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">介護度 × 利用時間 の構成</h3>
        <p className="text-[10px] text-gray-400 mb-3">
          在籍中の利用者を、介護度と利用時間区分で集計しています。「按分後」は 5時間以上=1.0人／3時間以上5時間未満=0.5人／3時間未満=0人 で換算した人数です
        </p>
        {composition.grandTotal === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">在籍中の利用者が登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 font-medium whitespace-nowrap">介護度</th>
                  {composition.categories.map((cat, i) => (
                    <th key={cat} className="text-right py-1.5 font-medium whitespace-nowrap px-2">
                      {CATEGORY_LABELS[cat] ?? cat}
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
                    <td key={composition.categories[i]} className="py-2 text-right px-2">
                      {cap != null ? cap : '-'}
                    </td>
                  ))}
                  <td className="py-2 text-right pl-2">{composition.capacity ?? '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 前月・当月・翌月 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">前月・当月・翌月</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MonthCard summary={overview.prevMonth} caption="実績" mode="actual" />
          <MonthCard summary={overview.currentMonth} caption="実績（本日まで）" mode="partial" />
          <MonthCard summary={overview.nextMonth} caption="予測" mode="forecast" />
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          予測は、利用者マスタの利用曜日と直近3か月の営業曜日・実績出席率（予定に対して
          {Math.round(overview.forecastRatio * 100)}%）をもとに算出した目安です。祝日等の臨時休業は反映されません。
        </p>
      </div>

      {/* 年度サマリー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">年度サマリー（4月〜3月）</h3>
        <div className="overflow-x-auto">
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
                      （{fy.fiscalYear}年度{fy.inProgress ? '・本日まで' : ''}）
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
    </div>
  )
}
