import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { type Resident, type DailyRecord } from '@/types/database'
import TrainingTable from '@/app/training/training-table'

function toDateStr(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

// 日付文字列を日単位でずらす。サーバーのタイムゾーンに依存しないようローカル日付として扱う
function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}

export default async function FacilitySlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireSession()
  const { slug } = await params

  const { data: facility } = await supabase
    .from('Facility')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()

  if (!facility) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-500">
        <p className="text-base">このURLは存在しません</p>
        <Link href="/dashboard" className="text-sm text-teal-600 underline">ダッシュボードへ</Link>
      </div>
    )
  }

  if (session.facilityId !== facility.id) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="font-semibold text-gray-800">このURLは「{facility.name}」専用です</p>
        <p className="text-sm text-gray-500">現在別の施設としてログインしています</p>
        <Link href="/dashboard" className="mt-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 transition">
          自分のダッシュボードへ
        </Link>
      </div>
    )
  }

  const params2 = await searchParams
  const today = params2.date || toDateStr(new Date())
  const todayDow = new Date(today + 'T00:00:00').getDay()

  const { data: allResidents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)
    .order('furigana', { ascending: true, nullsFirst: false })
    .order('name')

  const trainingResidents = (allResidents ?? []).filter((r: Resident) => !!r.trainingDays)
  const residents = trainingResidents.filter((r: Resident) =>
    !r.attendanceDays || r.attendanceDays.split(',').map(Number).includes(todayDow)
  )

  const residentIds = residents.map(r => r.id)
  const { data: records } = residentIds.length > 0
    ? await supabase.from('DailyRecord').select('*').eq('date', today).in('residentId', residentIds)
    : { data: [] }

  const recordMap: Record<string, DailyRecord> = {}
  for (const r of records ?? []) recordMap[r.residentId] = r

  const [year, month, day] = today.split('-')
  const dateLabel = `${year}年${+month}月${+day}日`
  const dowLabel = ['日', '月', '火', '水', '木', '金', '土'][todayDow]

  const prevDate = shiftDate(today, -1)
  const nextDate = shiftDate(today, 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">機能訓練記録</h2>
          <p className="text-sm text-gray-500">{dateLabel}（{dowLabel}曜日）・ 訓練対象者 {residents.length}名</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${slug}?date=${prevDate}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">◀ 前日</Link>
          <Link href={`/${slug}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">今日</Link>
          <Link href={`/${slug}?date=${nextDate}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">翌日 ▶</Link>
        </div>
      </div>

      {residents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
          {trainingResidents.length === 0 ? (
            <>
              <p className="text-base">機能訓練対象者が登録されていません</p>
              <p className="text-xs mt-2">利用者管理で「機能訓練対象」にチェックを入れてください</p>
              <Link href="/residents" className="mt-4 inline-block text-teal-600 underline text-sm">利用者管理へ</Link>
            </>
          ) : (
            <>
              <p className="text-base">本日（{dowLabel}曜日）の機能訓練対象者はいません</p>
              <p className="text-xs mt-2">機能訓練対象者 {trainingResidents.length}名 のうち、{dowLabel}曜日の設定がありません</p>
            </>
          )}
        </div>
      ) : (
        <TrainingTable residents={residents as Resident[]} recordMap={recordMap} date={today} />
      )}
    </div>
  )
}
