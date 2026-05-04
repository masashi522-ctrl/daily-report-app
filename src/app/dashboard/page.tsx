import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { FOOD_TYPE_LABELS, BATHING_LABELS, type Resident, type DailyRecord } from '@/types/database'
import DailyRecordTable from './daily-record-table'

function toDateStr(date: Date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireSession()
  const params = await searchParams
  const today = params.date || toDateStr(new Date())

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .order('sortOrder')
    .order('name')

  const { data: records } = await supabase
    .from('DailyRecord')
    .select('*')
    .eq('date', today)

  const recordMap = new Map<string, DailyRecord>()
  records?.forEach(r => recordMap.set(r.residentId, r))

  const displayDate = new Date(today + 'T00:00:00')
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const dateLabel = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${dayNames[displayDate.getDay()]}）`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{dateLabel}</h2>
          <p className="text-sm text-gray-500">利用者数: {residents?.length ?? 0}名</p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-sm text-gray-600">日付:</label>
          <input
            type="date"
            name="date"
            defaultValue={today}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            表示
          </button>
        </form>
      </div>

      <DailyRecordTable
        residents={residents ?? []}
        recordMap={Object.fromEntries(recordMap)}
        date={today}
      />
    </div>
  )
}
