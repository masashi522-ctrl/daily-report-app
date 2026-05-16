import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { FOOD_TYPE_LABELS, BATHING_LABELS, type Resident, type DailyRecord } from '@/types/database'
import DailyRecordTable from './daily-record-table'
import AddTemporaryModal from './add-temporary-modal'

function toDateStr(date: Date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = params.date || toDateStr(new Date())

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)
    .order('sortOrder')
    .order('name')

  const residentIds = (residents ?? []).map(r => r.id)

  const { data: records } = residentIds.length > 0
    ? await supabase.from('DailyRecord').select('*').eq('date', today).in('residentId', residentIds)
    : { data: [] }

  const recordMap = new Map<string, DailyRecord>()
  records?.forEach(r => recordMap.set(r.residentId, r))

  const displayDate = new Date(today + 'T00:00:00')
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const todayDow = displayDate.getDay()
  const dateLabel = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${dayNames[todayDow]}）`

  // 本日スケジュール外（attendanceDays に今日が含まれない）の利用者 → 臨時追加候補
  const nonScheduledResidents = (residents ?? []).filter((r: Resident) => {
    if (!r.attendanceDays) return false
    return !r.attendanceDays.split(',').map(Number).includes(todayDow)
  })

  // 本日すでに臨時追加済みの residentId
  const temporaryIds = (records ?? [])
    .filter(r => r.isTemporaryAttendance)
    .map(r => r.residentId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{dateLabel}</h2>
          <p className="text-sm text-gray-500">利用者数: {residents?.length ?? 0}名</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AddTemporaryModal
            date={today}
            nonScheduledResidents={nonScheduledResidents as Resident[]}
            temporaryResidentIds={temporaryIds}
          />
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
      </div>

      <DailyRecordTable
        residents={residents ?? []}
        recordMap={Object.fromEntries(recordMap)}
        date={today}
      />
    </div>
  )
}
