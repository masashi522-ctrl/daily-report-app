import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { FOOD_TYPE_LABELS, type FoodType } from '@/types/database'
import ResidentForm from './resident-form'
import { deleteResident, toggleActive } from './actions'

export default async function ResidentsPage() {
  await requireSession()

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .order('sortOrder')
    .order('name')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">利用者管理</h2>
        <span className="text-sm text-gray-500">登録: {residents?.length ?? 0}名</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-xs">
                  <th className="px-4 py-2 text-left">名前</th>
                  <th className="px-3 py-2 text-left">食事形態</th>
                  <th className="px-3 py-2 text-left">禁止</th>
                  <th className="px-3 py-2 text-left">特記</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {residents?.map((r, i) => (
                  <tr key={r.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-3 py-2 text-gray-600">{FOOD_TYPE_LABELS[r.foodType as FoodType]}</td>
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
                      <form action={deleteResident.bind(null, r.id)}>
                        <button className="text-red-500 hover:text-red-700 text-xs">削除</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {(!residents || residents.length === 0) && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">利用者が登録されていません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-4">利用者を追加</h3>
            <ResidentForm />
          </div>
        </div>
      </div>
    </div>
  )
}
