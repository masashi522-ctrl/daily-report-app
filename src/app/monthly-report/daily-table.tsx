import Link from 'next/link'
import { formatHours } from '@/lib/attendance-stats'
import type { MonthlyDailyStats } from '@/lib/monthly-daily-stats'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function fmt(n: number | null, unit = '') {
  return n == null ? '―' : `${n.toFixed(1)}${unit}`
}

export default function MonthlyDailyTable({ stats }: { stats: MonthlyDailyStats }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print-block">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">日別の利用状況</h3>
          <p className="text-xs text-gray-400">
            {stats.year}年{stats.month}月 ・ 営業 {stats.businessDays}日 ・ 延べ {stats.totalVisits}人 ・ 送迎減 {stats.totalPickupDrop}回
          </p>
        </div>
        <Link
          href={`/print/monthly-daily?year=${stats.year}&month=${stats.month}`}
          target="_blank"
          className="shrink-0 print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          この表だけ印刷
        </Link>
      </div>

      {stats.rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">この月の記録がまだありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="py-2 text-left font-medium">日付</th>
                <th className="py-2 text-right px-2 font-medium">利用者数</th>
                <th className="py-2 text-right px-2 font-medium">要介護</th>
                <th className="py-2 text-right px-2 font-medium">要支援</th>
                <th className="py-2 text-right px-2 font-medium">平均提供時間</th>
                <th className="py-2 text-right pl-2 font-medium">送迎減</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map(r => {
                const day = Number(r.date.slice(8))
                const isSun = r.dow === 0
                const isSat = r.dow === 6
                return (
                  <tr key={r.date} className="border-b border-gray-50">
                    <td className={`py-1.5 tabular-nums ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                      {day}日<span className="text-xs ml-1">（{DOW[r.dow]}）</span>
                    </td>
                    <td className="py-1.5 text-right px-2 font-medium text-gray-800 tabular-nums">{r.total}</td>
                    <td className="py-1.5 text-right px-2 text-rose-700 tabular-nums">{r.care}</td>
                    <td className="py-1.5 text-right px-2 text-sky-700 tabular-nums">{r.support}</td>
                    <td className="py-1.5 text-right px-2 text-gray-700 tabular-nums">{formatHours(r.avgHours)}</td>
                    <td className={`py-1.5 text-right pl-2 tabular-nums ${r.pickupDropCount > 0 ? 'text-amber-700 font-medium' : 'text-gray-300'}`}>
                      {r.pickupDropCount > 0 ? r.pickupDropCount : '―'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                <td className="py-2">合計</td>
                <td className="py-2 text-right px-2 tabular-nums">{stats.totalVisits}</td>
                <td className="py-2 text-right px-2 tabular-nums">{stats.rows.reduce((n, r) => n + r.care, 0)}</td>
                <td className="py-2 text-right px-2 tabular-nums">{stats.rows.reduce((n, r) => n + r.support, 0)}</td>
                <td className="py-2 text-right px-2 text-gray-400">―</td>
                <td className="py-2 text-right pl-2 tabular-nums">{stats.totalPickupDrop}</td>
              </tr>
              <tr className="text-gray-600">
                <td className="py-2">1日平均</td>
                <td className="py-2 text-right px-2 tabular-nums">{fmt(stats.avgTotal)}</td>
                <td className="py-2 text-right px-2 tabular-nums">{fmt(stats.avgCare)}</td>
                <td className="py-2 text-right px-2 tabular-nums">{fmt(stats.avgSupport)}</td>
                <td className="py-2 text-right px-2 tabular-nums">{formatHours(stats.avgHours)}</td>
                <td className="py-2 text-right pl-2 tabular-nums">{fmt(stats.businessDays > 0 ? stats.totalPickupDrop / stats.businessDays : null)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="text-[10px] text-gray-400 mt-2 flex flex-col gap-0.5">
        <p>日次記録があり、欠席でない利用者を1人と数えています（稼働率の集計と同じ数え方です）。</p>
        <p>記録が1件も無い日は休業日とみなし、行に出していません。</p>
        <p>平均提供時間は、特記事項に「利用時間 9:30-15:00」と記載があればその時間を優先します。記載が無ければ登録されている提供開始・終了時刻、それも無ければ利用時間区分の下限（例：5-6時間なら5時間）を使い、どちらも無い方は平均から除いています。</p>
        <p>送迎減は、特記事項の「迎えなし」「送りなし」をそれぞれ1回として数えています（「送迎なし」は往復とみなして2回）。</p>
      </div>
    </div>
  )
}
