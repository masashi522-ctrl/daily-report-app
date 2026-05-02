import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { deleteStaff } from './actions'
import StaffForm from './staff-form'

export default async function StaffPage() {
  await requireSession()
  const { data: staffList } = await supabase.from('Staff').select('id, name, email, role, createdAt').order('createdAt')

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-gray-800">スタッフ管理</h2>

      <StaffForm />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700 text-xs">
              <th className="px-4 py-3 text-left">名前</th>
              <th className="px-4 py-3 text-left">メールアドレス</th>
              <th className="px-4 py-3 text-left">権限</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {staffList?.map((staff, i) => (
              <tr key={staff.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-4 py-3 font-medium">{staff.name}</td>
                <td className="px-4 py-3 text-gray-600">{staff.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${staff.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {staff.role === 'ADMIN' ? '管理者' : 'スタッフ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={async () => {
                    'use server'
                    await deleteStaff(staff.id)
                  }}>
                    <button type="submit"
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition"
                      onClick={(e) => { if (!confirm(`${staff.name} を削除しますか？`)) e.preventDefault() }}>
                      削除
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!staffList || staffList.length === 0) && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
