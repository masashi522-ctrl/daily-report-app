import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident, type DailyRecord } from '@/types/database'
import DailyRecordTable from './daily-record-table'
import AddTemporaryModal from './add-temporary-modal'
import DaySummaryBar from './day-summary'
import { summarizeDay } from '@/lib/attendance-stats'
import { isInServicePeriod, effectiveAttendanceDays } from '@/lib/service-period'
import { isRecentlyRegistered } from '@/lib/resident-warnings'

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
  const realToday = toDateStr(new Date())
  const today = params.date || realToday
  // 過去日は、利用者マスタの「今の」利用曜日設定ではなく実際の記録の有無で判断する。
  // でないと、月の途中で利用曜日を追加/削除したとき、その変更が過去の日付にも
  // 適用されてしまい、当時は対象でなかった利用者が過去日の一覧に出てしまう
  const isPastDate = today < realToday

  const { data: allResidents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)
    .order('furigana', { ascending: true, nullsFirst: false })
    .order('name')

  // 利用開始前に登録された方は、その日にはまだ出さない
  const residents = (allResidents ?? []).filter((r: Resident) => isInServicePeriod(r, today))

  const residentIds = residents.map(r => r.id)

  const { data: records } = residentIds.length > 0
    ? await supabase.from('DailyRecord').select('*').eq('date', today).in('residentId', residentIds)
        .order('updatedAt', { ascending: false })
    : { data: [] }

  const recordMap = new Map<string, DailyRecord>()
  for (const r of records ?? []) {
    if (!recordMap.has(r.residentId)) recordMap.set(r.residentId, r)
  }

  const displayDate = new Date(today + 'T00:00:00')
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const todayDow = displayDate.getDay()
  const dateLabel = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${dayNames[todayDow]}）`

  // 本日スケジュール外の利用者 → 臨時追加候補（曜日未設定 or 今日が含まれない）
  // 過去日は、その日に記録が無い＝当時のスケジュール外だった人として扱う
  const nonScheduledResidents = residents.filter((r: Resident) => {
    if (isPastDate) return !recordMap.has(r.id)
    const days = effectiveAttendanceDays(r, today)
    if (!days) return true
    return !days.split(',').map(Number).includes(todayDow)
  })

  // その日の利用状況。画面に並ぶ対象者（曜日の予定者＋臨時追加）から
  // 欠席の方を除いて数える
  const attendees = residents.filter((r: Resident) => {
    const rec = recordMap.get(r.id)
    if (isPastDate) return rec != null && !rec.isAbsent
    if (rec?.isAbsent) return false
    if (rec?.isTemporaryAttendance) return true
    const days = effectiveAttendanceDays(r, today)
    if (!days) return true
    return days.split(',').map(Number).includes(todayDow)
  })
  const daySummary = summarizeDay(
    attendees.map((r: Resident) => ({ resident: r, specialNotes: recordMap.get(r.id)?.specialNotes ?? null })),
  )

  // 利用開始日が未入力の方。記録を書く画面で気づけるよう、その日に並ぶ方から数える。
  // 一覧に出ている＝その日の記録を付ける方なので、記録の有無を別途調べる必要はない。
  // 登録から日が経った方は、今さら開始日を調べるのが難しいことが多いため対象外にする
  // （/residents の警告と同じ基準。resident-warnings.ts参照）
  const missingStartDate = residents.filter((r: Resident) =>
    !String(r.serviceStartDate ?? '').trim() && isRecentlyRegistered(r.createdAt))

  // 本日すでに臨時追加済みの residentId
  const temporaryIds = (records ?? [])
    .filter(r => r.isTemporaryAttendance)
    .map(r => r.residentId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{dateLabel}</h2>
          <p className="text-sm text-gray-500">登録者 {residents.length}名</p>
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

      {missingStartDate.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-amber-900 flex-1 min-w-[16rem]">
            <span className="font-semibold">
              本日の一覧に、利用開始日が未入力の方が{missingStartDate.length}名います。
            </span>
            <span className="block text-xs mt-0.5">
              未入力のままだと、実際に利用を始める前の月にも集計対象として並び、月次報告の「新規利用開始」にも出てきません。（登録から3か月以内の方のみ表示）
            </span>
          </p>
          <Link
            href="/residents?filter=missing-start"
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-800 font-medium whitespace-nowrap hover:border-amber-500"
          >
            利用者管理で設定する
          </Link>
        </div>
      )}

      <DaySummaryBar summary={daySummary} />

      <DailyRecordTable
        residents={residents}
        recordMap={Object.fromEntries(recordMap)}
        date={today}
        isPastDate={isPastDate}
      />
    </div>
  )
}
