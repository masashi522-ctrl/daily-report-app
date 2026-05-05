import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import StaffForm from './staff-form'
import DeleteButton from './delete-button'
import EditButton from './edit-button'

export default async function StaffPage() {
  const session = await requireSession()
  const isAdmin = session.role === 'ADMIN'
  const { data: staffList } = await supabase.from('Staff').select('id, name, email, role, createdAt').order('createdAt')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">スタッフ管理</h2>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-1">自分のアカウントのみ削除できます</p>
        )}
      </div>

      {isAdmin && <StaffForm />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700 text-xs">
              <th className="px-4 py-3 text-left">名前</th>
              <th className="px-4 py-3 text-left">メールアドレス</th>
              <th className="px-4 py-3 text-left">権限</th>
              <th className="px-4 py-3" colSpan={2}></th>
            </tr>
          </thead>
          <tbody>
            {staffList?.map((staff, i) => (
              <tr key={staff.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-4 py-3 font-medium">
                  {staff.name}
                  {staff.id === session.userId && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">自分</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{staff.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${staff.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {staff.role === 'ADMIN' ? '管理者' : 'スタッフ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {(isAdmin || staff.id === session.userId) && (
                    <EditButton staff={staff} isAdmin={isAdmin} />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {(isAdmin || staff.id === session.userId) && (
                    <DeleteButton id={staff.id} name={staff.name} />
                  )}
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
