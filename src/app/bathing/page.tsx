import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident, type DailyRecord } from '@/types/database'
import BathingTable from './bathing-table'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function BathingPage({
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

  const recordMap: Record<string, DailyRecord> = {}
  for (const r of records ?? []) recordMap[r.residentId] = r

  const [year, month, day] = today.split('-')
  const dateLabel = `${year}年${+month}月${+day}日`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">入浴記録</h2>
          <p className="text-sm text-gray-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/bathing?date=${(() => { const d = new Date(today); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">
            ◀ 前日
          </a>
          <a href="/bathing"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">
            今日
          </a>
          <a href={`/bathing?date=${(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">
            翌日 ▶
          </a>
        </div>
      </div>

      <BathingTable
        residents={(residents ?? []) as Resident[]}
        recordMap={recordMap}
        date={today}
      />
    </div>
  )
}
