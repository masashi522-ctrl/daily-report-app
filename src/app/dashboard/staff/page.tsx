import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import StaffForm from './staff-form'
import DeleteButton from './delete-button'
import EditButton from './edit-button'

export default async function StaffPage() {
  const session = await requireSession()
  const isAdmin = session.role === 'ADMIN'

  const { data: staffList } = await supabase
    .from('Staff')
    .select('id, name, email, role, createdAt')
    .eq('facilityId', session.facilityId)
    .order('createdAt')

  const { data: facility } = await supabase
    .from('Facility')
    .select('name, facilityCode')
    .eq('id', session.facilityId)
    .maybeSingle()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">スタッフ管理</h2>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-1">自分のアカウントのみ削除できます</p>
        )}
      </div>

      {/* 施設コード表示（管理者のみ） */}
      {isAdmin && facility && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-medium text-blue-600">施設名</p>
            <p className="text-sm font-bold text-blue-900">{facility.name}</p>
          </div>
          <div className="ml-auto sm:ml-6">
            <p className="text-xs font-medium text-blue-600">施設コード（スタッフ登録時に必要）</p>
            <p className="text-2xl font-bold tracking-widest text-blue-800 font-mono">{facility.facilityCode}</p>
          </div>
          <p className="text-xs text-blue-500 w-full">このコードを新しいスタッフに共有すると、<a href="/register" className="underline" target="_blank">/register</a> から施設に紐付けて登録できます</p>
        </div>
      )}

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
