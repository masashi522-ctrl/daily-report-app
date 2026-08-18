import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident, type DailyRecord } from '@/types/database'
import BathingTable from './bathing-table'
import AddTemporaryModal from '../dashboard/add-temporary-modal'

function toDateStr(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

// 日付文字列を日単位でずらす。サーバーのタイムゾーンに依存しないようローカル日付として扱う
function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}

export default async function BathingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = params.date || toDateStr(new Date())

  const todayDow = new Date(today + 'T00:00:00').getDay() // 0=日 〜 6=土

  const { data: allResidents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)
    .order('furigana', { ascending: true, nullsFirst: false })
    .order('name')

  // bathingDays に今日の曜日が含まれる利用者
  const regularResidents = (allResidents ?? []).filter((r: Resident) => {
    if (!r.bathingDays) return false
    return r.bathingDays.split(',').map(Number).includes(todayDow)
  })

  // 臨時利用者の取得
  const allResidentIds = (allResidents ?? []).map(r => r.id)
  const { data: tempRecords } = allResidentIds.length > 0
    ? await supabase
        .from('DailyRecord')
        .select('residentId')
        .eq('date', today)
        .eq('isTemporaryAttendance', true)
        .in('residentId', allResidentIds)
    : { data: [] }

  const tempIds = new Set((tempRecords ?? []).map((r: { residentId: string }) => r.residentId))
  const temporaryResidents = (allResidents ?? []).filter((r: Resident) =>
    tempIds.has(r.id) &&
    !regularResidents.some(rr => rr.id === r.id)
  )

  const nonScheduledResidents = (allResidents ?? []).filter(
    (r: Resident) =>
      !regularResidents.some(rr => rr.id === r.id) &&
      !!r.attendanceDays &&
      r.attendanceDays.split(',').map(Number).includes(todayDow)
  )
  const temporaryResidentIds = Array.from(tempIds)

  const residents = [...regularResidents, ...temporaryResidents]

  const residentIds = residents.map(r => r.id)
  const { data: records } = residentIds.length > 0
    ? await supabase.from('DailyRecord').select('*').eq('date', today).in('residentId', residentIds)
        .order('updatedAt', { ascending: false })
    : { data: [] }

  const recordMap: Record<string, DailyRecord> = {}
  for (const r of records ?? []) {
    if (!recordMap[r.residentId]) recordMap[r.residentId] = r
  }

  const [year, month, day] = today.split('-')
  const dateLabel = `${year}年${+month}月${+day}日`
  const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][todayDow]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">入浴記録</h2>
          <p className="text-sm text-gray-500">{dateLabel}（{dowLabel}曜日）・ 入浴対象者 {residents.length}名</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AddTemporaryModal
            date={today}
            nonScheduledResidents={nonScheduledResidents}
            temporaryResidentIds={temporaryResidentIds}
          />
          <Link href={`/bathing?date=${shiftDate(today, -1)}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">◀ 前日</Link>
          <Link href="/bathing"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">今日</Link>
          <Link href={`/bathing?date=${shiftDate(today, 1)}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">翌日 ▶</Link>
        </div>
      </div>

      {residents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
          <p className="text-base">{dowLabel}曜日の入浴対象者がいません</p>
          <p className="text-xs mt-2">利用者管理で「入浴対象日」を設定するか、上の「臨時利用者を追加」から追加してください</p>
          <Link href="/residents" className="mt-4 inline-block text-teal-600 underline text-sm">利用者管理へ</Link>
        </div>
      ) : (
        <BathingTable residents={residents as Resident[]} recordMap={recordMap} date={today} />
      )}
    </div>
  )
}
