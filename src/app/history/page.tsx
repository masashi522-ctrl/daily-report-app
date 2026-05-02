import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { FOOD_TYPE_LABELS, BATHING_LABELS, type FoodType, type BathingStatus } from '@/types/database'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; from?: string; to?: string }>
}) {
  await requireSession()
  const params = await searchParams

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const from = params.from || thirtyDaysAgo
  const to = params.to || today
  const residentId = params.residentId || ''

  const { data: residents } = await supabase.from('Resident').select('id, name').order('name')

  let query = supabase
    .from('DailyRecord')
    .select('*, Resident(name, foodType)')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })

  if (residentId) query = query.eq('residentId', residentId)

  const { data: records } = await query.limit(200)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-gray-800">過去記録検索</h2>

      <form className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-600 block mb-1">利用者</label>
          <select name="residentId" defaultValue={residentId}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">全員</option>
            {residents?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">開始日</label>
          <input type="date" name="from" defaultValue={from}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">終了日</label>
          <input type="date" name="to" defaultValue={to}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          検索
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-700">
              <th className="px-3 py-2 text-left">日付</th>
              <th className="px-3 py-2 text-left">名前</th>
              <th className="px-3 py-2">血圧AM</th>
              <th className="px-3 py-2">血圧PM</th>
              <th className="px-3 py-2">脈拍AM</th>
              <th className="px-3 py-2">脈拍PM</th>
              <th className="px-3 py-2">体温AM</th>
              <th className="px-3 py-2">体温PM</th>
              <th className="px-3 py-2">入浴</th>
              <th className="px-3 py-2">食事（主食/主菜）</th>
              <th className="px-3 py-2">水分AM</th>
              <th className="px-3 py-2">水分PM</th>
              <th className="px-3 py-2">口腔</th>
              <th className="px-3 py-2">特記</th>
            </tr>
          </thead>
          <tbody>
            {records?.map((r, i) => {
              const resident = r.Resident as { name: string; foodType: FoodType } | null
              return (
                <tr key={r.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <td className="px-3 py-1.5 text-gray-600">{r.date}</td>
                  <td className="px-3 py-1.5 font-medium">{resident?.name}</td>
                  <td className="px-3 py-1.5 text-center">{r.bpSystolic && r.bpDiastolic ? `${r.bpSystolic}/${r.bpDiastolic}` : '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.bpSystolicPm && r.bpDiastolicPm ? `${r.bpSystolicPm}/${r.bpDiastolicPm}` : '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.pulse ?? '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.pulsePm ?? '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.tempMorning ?? '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.tempAfternoon ?? '-'}</td>
                  <td className="px-3 py-1.5 text-center">{BATHING_LABELS[r.bathing as BathingStatus]}</td>
                  <td className="px-3 py-1.5 text-center">
                    {r.mealMainFood != null || r.mealSideFood != null
                      ? `${r.mealMainFood ?? '-'}割/${r.mealSideFood ?? '-'}割`
                      : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-center">{r.fluidIntakeAm != null ? `${r.fluidIntakeAm}ml` : '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.fluidIntakePm != null ? `${r.fluidIntakePm}ml` : '-'}</td>
                  <td className="px-3 py-1.5 text-center">{r.oralCare ? '○' : '-'}</td>
                  <td className="px-3 py-1.5 max-w-[150px] truncate text-gray-500">{r.specialNotes ?? '-'}</td>
                </tr>
              )
            })}
            {(!records || records.length === 0) && (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">記録がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 text-right">最大200件表示</p>
    </div>
  )
}
