import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ResidentForm from './resident-form'
import EditResidentForm from './edit-resident-form'
import ResidentList from './resident-list'

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
        {/* フォーム: モバイルで先頭、PCで右側 */}
        <div className="order-1 lg:order-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {editingResident ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-800">利用者を編集</h3>
                  <a href="/residents" className="text-xs text-gray-400 hover:text-gray-600">✕ キャンセル</a>
                </div>
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

        {/* リスト: モバイルで2番目、PCで左側(2列) */}
        <div className="order-2 lg:order-1 lg:col-span-2">
          <ResidentList residents={residents ?? []} editId={editId} />
        </div>
      </div>
    </div>
  )
}
