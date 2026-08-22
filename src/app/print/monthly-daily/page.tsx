import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { computeMonthlyDailyStats } from '@/lib/monthly-daily-stats'
import { formatHours } from '@/lib/attendance-stats'
import DailyPrintActions from './print-actions'

// 日別の利用状況だけをA4縦1枚で印刷するための画面。
// 月次報告の他の枠は載せない。

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function jstToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function addMonths(year: number, month: number, diff: number) {
  const d = new Date(year, month - 1 + diff, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function fmt(n: number | null) {
  return n == null ? '―' : n.toFixed(1)
}

export default async function DailyPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = jstToday()

  const year = Number(params.year) || parseInt(today.slice(0, 4))
  const month = Number(params.month) || parseInt(today.slice(5, 7))

  const [stats, { data: facility }] = await Promise.all([
    computeMonthlyDailyStats(session.facilityId, year, month),
    supabase.from('Facility').select('name').eq('id', session.facilityId).maybeSingle(),
  ])

  const totalCare = stats.rows.reduce((n, r) => n + r.care, 0)
  const totalSupport = stats.rows.reduce((n, r) => n + r.support, 0)

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white print:min-h-0">
      <style>{`
        @page { size: A4 portrait; margin: 14mm; }
        @media print {
          body { background: white; }
          .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; border: none; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <DailyPrintActions
        year={year} month={month}
        prev={addMonths(year, month, -1)}
        next={addMonths(year, month, 1)}
      />

      <div className="sheet max-w-[210mm] mx-auto my-6 bg-white shadow-sm border border-gray-200 p-8 print:my-0 print:p-0">
        {/* 見出し */}
        <div className="flex items-end justify-between border-b-2 border-gray-800 pb-2 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">日別の利用状況</h1>
            <p className="text-sm text-gray-600 mt-0.5">{facility?.name ?? ''}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900 tabular-nums">{year}年{month}月</p>
            <p className="text-xs text-gray-500 tabular-nums">
              営業 {stats.businessDays}日 ・ 延べ {stats.totalVisits}人 ・ 送迎減 {stats.totalPickupDrop}回
            </p>
          </div>
        </div>

        {stats.rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-16 text-center">この月の記録がありません</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="border border-gray-300 py-1.5 px-2 text-left font-semibold w-[22%]">日付</th>
                <th className="border border-gray-300 py-1.5 px-2 text-right font-semibold">利用者数</th>
                <th className="border border-gray-300 py-1.5 px-2 text-right font-semibold">要介護</th>
                <th className="border border-gray-300 py-1.5 px-2 text-right font-semibold">要支援</th>
                <th className="border border-gray-300 py-1.5 px-2 text-right font-semibold">平均提供時間</th>
                <th className="border border-gray-300 py-1.5 px-2 text-right font-semibold">送迎減</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map(r => {
                const day = Number(r.date.slice(8))
                const isSun = r.dow === 0
                const isSat = r.dow === 6
                return (
                  <tr key={r.date}>
                    <td className={`border border-gray-300 py-1 px-2 tabular-nums ${
                      isSun ? 'text-red-600' : isSat ? 'text-blue-600' : 'text-gray-800'
                    }`}>
                      {day}日（{DOW[r.dow]}）
                    </td>
                    <td className="border border-gray-300 py-1 px-2 text-right tabular-nums font-medium">{r.total}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right tabular-nums">{r.care}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right tabular-nums">{r.support}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right tabular-nums">{formatHours(r.avgHours)}</td>
                    <td className="border border-gray-300 py-1 px-2 text-right tabular-nums">
                      {r.pickupDropCount > 0 ? r.pickupDropCount : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold text-gray-900">
                <td className="border border-gray-300 py-1.5 px-2">合計</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{stats.totalVisits}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{totalCare}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{totalSupport}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right text-gray-400">―</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{stats.totalPickupDrop}</td>
              </tr>
              <tr className="bg-gray-50 text-gray-700">
                <td className="border border-gray-300 py-1.5 px-2">1日平均</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{fmt(stats.avgTotal)}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{fmt(stats.avgCare)}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{fmt(stats.avgSupport)}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">{formatHours(stats.avgHours)}</td>
                <td className="border border-gray-300 py-1.5 px-2 text-right tabular-nums">
                  {fmt(stats.businessDays > 0 ? stats.totalPickupDrop / stats.businessDays : null)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="text-[9px] text-gray-500 mt-3 flex flex-col gap-0.5">
          <p>日次記録があり、欠席でない利用者を1人と数えています。記録が1件も無い日は休業日とみなし、行に出していません。</p>
          <p>平均提供時間は、特記事項に「利用時間 9:30-15:00」と記載があればその時間を優先します。記載が無ければ登録されている提供開始・終了時刻、それも無ければ利用時間区分の下限を使い、どちらも無い方は平均から除いています。</p>
          <p>送迎減は、特記事項の「迎えなし」「送りなし」をそれぞれ1回として数えています（「送迎なし」は往復とみなして2回）。</p>
        </div>
      </div>
    </div>
  )
}
