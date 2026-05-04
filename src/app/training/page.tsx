import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident, type DailyRecord } from '@/types/database'
import TrainingTable from './training-table'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireSession()
  const params = await searchParams
  const today = params.date || toDateStr(new Date())

  const todayDow = new Date(today + 'T00:00:00').getDay()

  const { data: allResidents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .order('sortOrder')
    .order('name')

  // trainingDays に今日の曜日が含まれる利用者だけ表示
  const residents = (allResidents ?? []).filter((r: Resident) => {
    if (!r.trainingDays) return false
    return r.trainingDays.split(',').map(Number).includes(todayDow)
  })

  const { data: records } = await supabase
    .from('DailyRecord')
    .select('*')
    .eq('date', today)

  const recordMap: Record<string, DailyRecord> = {}
  for (const r of records ?? []) recordMap[r.residentId] = r

  const [year, month, day] = today.split('-')
  const dateLabel = `${year}年${+month}月${+day}日`
  const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][todayDow]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">機能訓練記録</h2>
          <p className="text-sm text-gray-500">{dateLabel}（{dowLabel}曜日）・ 訓練対象者 {residents.length}名</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/training?date=${(() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">◀ 前日</a>
          <a href="/training"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">今日</a>
          <a href={`/training?date=${(() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">翌日 ▶</a>
        </div>
      </div>

      {residents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
          <p className="text-base">{dowLabel}曜日の機能訓練対象者がいません</p>
          <p className="text-xs mt-2">利用者管理で「機能訓練対象日」を設定してください</p>
          <a href="/residents" className="mt-4 inline-block text-teal-600 underline text-sm">利用者管理へ</a>
        </div>
      ) : (
        <TrainingTable residents={residents as Resident[]} recordMap={recordMap} date={today} />
      )}
    </div>
  )
}
