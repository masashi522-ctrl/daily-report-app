import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { FOOD_TYPE_LABELS, type FoodType } from '@/types/database'
import ResidentForm from './resident-form'
import EditResidentForm from './edit-resident-form'
import { deleteResident, toggleActive } from './actions'

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireSession()

  const { edit: editId } = await searchParams

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .order('sortOrder')
    .order('name')

  const editingResident = editId ? residents?.find(r => r.id === editId) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">利用者管理</h2>
        <span className="text-sm text-gray-500">登録: {residents?.length ?? 0}名</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">

          {/* ── デスクトップ: テーブル ── */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-xs">
                  <th className="px-4 py-2 text-left">名前</th>
                  <th className="px-3 py-2 text-left">食事形態</th>
                  <th className="px-3 py-2 text-left">利用曜日</th>
                  <th className="px-3 py-2 text-left">禁止</th>
                  <th className="px-3 py-2 text-left">特記</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {residents?.map((r, i) => (
                  <tr key={r.id} className={`border-t ${editId === r.id ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {r.foodType ? r.foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.attendanceDays
                        ? r.attendanceDays.split(',').map((d: string) => ['日','月','火','水','木','金','土'][+d]).join(' ')
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-red-600 text-xs">{r.foodRestrictions ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate">{r.specialCondition ?? '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <form action={toggleActive.bind(null, r.id, !r.isActive)}>
                        <button className={`text-xs px-2 py-0.5 rounded-full ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.isActive ? '在籍' : '退所'}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <a href={`/residents?edit=${r.id}`} className="text-blue-500 hover:text-blue-700 text-xs">編集</a>
                        <form action={deleteResident.bind(null, r.id)}>
                          <button className="text-red-500 hover:text-red-700 text-xs">削除</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!residents || residents.length === 0) && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">利用者が登録されていません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── モバイル: カード ── */}
          <div className="md:hidden flex flex-col gap-3">
            {(!residents || residents.length === 0) && (
              <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
                利用者が登録されていません
              </div>
            )}
            {residents?.map(r => (
              <div key={r.id} className={`bg-white rounded-xl border shadow-sm p-4 ${editId === r.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                {/* 名前 + 状態バッジ */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-800 text-base">{r.name}</span>
                  <form action={toggleActive.bind(null, r.id, !r.isActive)}>
                    <button className={`text-xs px-3 py-1 rounded-full font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.isActive ? '在籍' : '退所'}
                    </button>
                  </form>
                </div>

                {/* 詳細情報グリッド */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                  <div>
                    <span className="text-xs text-gray-400">食事形態</span>
                    <div className="text-gray-700 text-xs mt-0.5">
                      {r.foodType ? r.foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">利用曜日</span>
                    <div className="text-gray-700 text-xs mt-0.5">
                      {r.attendanceDays
                        ? r.attendanceDays.split(',').map((d: string) => ['日','月','火','水','木','金','土'][+d]).join(' ')
                        : '-'}
                    </div>
                  </div>
                  {r.foodRestrictions && (
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">禁止食品</span>
                      <div className="text-red-600 text-xs mt-0.5">{r.foodRestrictions}</div>
                    </div>
                  )}
                  {r.specialCondition && (
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">特記事項</span>
                      <div className="text-gray-600 text-xs mt-0.5">{r.specialCondition}</div>
                    </div>
                  )}
                </div>

                {/* 操作ボタン */}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <a
                    href={`/residents?edit=${r.id}`}
                    className="flex-1 text-center text-sm py-1.5 rounded-lg bg-blue-50 text-blue-600 font-medium hover:bg-blue-100"
                  >
                    編集
                  </a>
                  <form action={deleteResident.bind(null, r.id)} className="flex-1">
                    <button className="w-full text-sm py-1.5 rounded-lg bg-red-50 text-red-500 font-medium hover:bg-red-100">
                      削除
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>

        </div>

        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {editingResident ? (
              <>
                <h3 className="font-semibold text-gray-800 mb-1">利用者を編集</h3>
                <p className="text-xs text-blue-600 mb-4">{editingResident.name}</p>
                <EditResidentForm resident={editingResident} />
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-800 mb-4">利用者を追加</h3>
                <ResidentForm />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
