import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { computeMonthlyOperationsStats } from '@/lib/monthly-operations-stats'
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

function prevMonth(year: number, month: number) {
  const m = month - 1
  return m < 1 ? { year: year - 1, month: 12 } : { year, month: m }
}
function nextMonth(year: number, month: number) {
  const m = month + 1
  return m > 12 ? { year: year + 1, month: 1 } : { year, month: m }
}

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year || String(now.getFullYear()))
  const month = parseInt(params.month || String(now.getMonth() + 1))

  const [{ data: facilityRaw }, { data: activeResidents }, stats] = await Promise.all([
    supabase.from('Facility').select('capacity, capacityByCategory').eq('id', session.facilityId).maybeSingle(),
    supabase.from('Resident').select('serviceTimeCategory').eq('facilityId', session.facilityId).eq('isActive', true),
    computeMonthlyOperationsStats(session.facilityId, year, month),
  ])

  const facility = {
    capacity: (facilityRaw?.capacity ?? null) as number | null,
    capacityByCategory: (facilityRaw?.capacityByCategory ?? null) as Record<string, number> | null,
  }

  // 時間区分別定員の初期値提案用：現在登録されている（在籍中の）利用者数を区分ごとに集計
  const registeredCategoryCounts: Record<string, number> = {}
  for (const r of activeResidents ?? []) {
    if (r.serviceTimeCategory) {
      registeredCategoryCounts[r.serviceTimeCategory] = (registeredCategoryCounts[r.serviceTimeCategory] ?? 0) + 1
    }
  }

  const prev = prevMonth(year, month)
  const next = nextMonth(year, month)

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">月次報告</h2>
          <p className="text-sm text-gray-500">{year}年{month}月・営業日数 {stats.businessDays}日</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/monthly-report?year=${prev.year}&month=${prev.month}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">◀ 前月</a>
          <a href="/monthly-report"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">今月</a>
          <a href={`/monthly-report?year=${next.year}&month=${next.month}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">翌月 ▶</a>
        </div>
      </div>

      <CapacityForm facility={facility} registeredCategoryCounts={registeredCategoryCounts} />

      {/* サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: '営業日数', value: `${stats.businessDays}日` },
          { label: '延べ利用人数', value: `${stats.totalVisits}人` },
          { label: '実利用人数', value: `${stats.uniqueResidents}人` },
          { label: '欠席日数', value: `${stats.absentCount}日` },
          { label: '欠席率', value: stats.absentRate != null ? `${stats.absentRate}%` : '-' },
          { label: '稼働率（全体）', value: stats.occupancyRate != null ? `${stats.occupancyRate}%` : '未設定', highlight: true },
        ].map(item => (
          <div key={item.label}
            className={`bg-white rounded-xl border shadow-sm p-4 text-center ${item.highlight ? 'border-teal-300' : 'border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.highlight ? 'text-teal-700' : 'text-gray-700'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* 区分別集計 */}
      {stats.careLevelGroups.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">区分別の利用状況</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 font-medium">区分</th>
                  <th className="text-right py-1.5 font-medium">利用者数</th>
                  <th className="text-right py-1.5 font-medium">利用回数（延べ）</th>
                </tr>
              </thead>
              <tbody>
                {stats.careLevelGroups.map(g => (
                  <tr key={g.label} className="border-b border-gray-50">
                    <td className="py-2">{g.label}</td>
                    <td className="py-2 text-right">{g.residentCount}名</td>
                    <td className="py-2 text-right">{g.visitCount}回</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 時間区分別稼働率 */}
      {stats.categoryStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">時間区分別 稼働率</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 font-medium">時間区分</th>
                  <th className="text-right py-1.5 font-medium">定員</th>
                  <th className="text-right py-1.5 font-medium">延べ利用人数</th>
                  <th className="text-right py-1.5 font-medium">稼働率</th>
                </tr>
              </thead>
              <tbody>
                {stats.categoryStats.map(c => (
                  <tr key={c.category} className="border-b border-gray-50">
                    <td className="py-2">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                    <td className="py-2 text-right">{c.capacity != null ? `${c.capacity}名` : '未設定'}</td>
                    <td className="py-2 text-right">{c.totalVisits}回</td>
                    <td className="py-2 text-right font-medium">{c.occupancyRate != null ? `${c.occupancyRate}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 日別内訳 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">日別内訳</h3>
        {stats.days.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">この月の記録がありません</p>
        ) : (
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 font-medium">日付</th>
                  <th className="text-right py-1.5 font-medium">利用人数</th>
                  <th className="text-right py-1.5 font-medium">欠席人数</th>
                </tr>
              </thead>
              <tbody>
                {stats.days.map(d => {
                  const dayStr = d.date.split('-')[2]
                  return (
                    <tr key={d.date}
                      className={`border-b border-gray-50 ${d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : ''}`}>
                      <td className="py-1.5">{parseInt(dayStr)}日（{DOW[d.dow]}）</td>
                      <td className="py-1.5 text-right">{d.attend}人</td>
                      <td className="py-1.5 text-right">{d.absent}人</td>
                    </tr>
                  )
                })}
                <tr className="font-semibold bg-gray-50">
                  <td className="py-2">合計</td>
                  <td className="py-2 text-right">{stats.totalVisits}人</td>
                  <td className="py-2 text-right">{stats.absentCount}人</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
