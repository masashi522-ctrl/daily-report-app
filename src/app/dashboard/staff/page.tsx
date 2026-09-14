import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import StaffForm from './staff-form'
import DeleteButton from './delete-button'
import EditButton from './edit-button'
import TempPasswordButton from './temp-password-button'
import LineSettingPanel from './line-setting-panel'
import { getLineSetting } from './line-actions'
import { headers } from 'next/headers'

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
    .select('name, slug')
    .eq('id', session.facilityId)
    .maybeSingle()

  // LINEの設定は管理者だけが見られる。トークン自体は画面に返さない
  const lineSetting = isAdmin ? await getLineSetting() : null
  const host = (await headers()).get('host') ?? ''
  const webhookUrl = host ? `https://${host}/api/line/webhook` : '/api/line/webhook'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">スタッフ管理</h2>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-1">自分のアカウントのみ削除できます</p>
        )}
      </div>

      {/* 施設名表示（管理者のみ）。新しいスタッフのアカウントは、下のフォームから管理者が作成する */}
      {isAdmin && facility && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-600">施設名</p>
          <p className="text-sm font-bold text-blue-900">{facility.name}</p>
        </div>
      )}

      {isAdmin && facility?.slug && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-xs font-medium text-teal-600">この施設専用のログインURL</p>
          <p className="text-sm font-bold text-teal-900 font-mono break-all">{`/${facility.slug}/login`}</p>
          <p className="text-xs text-teal-500 mt-1">このURLをブックマークしてもらうと、スタッフは施設を意識せずログインできます</p>
        </div>
      )}

{isAdmin && lineSetting && (
        <LineSettingPanel setting={lineSetting} webhookUrl={webhookUrl} />
      )}

      {isAdmin && <StaffForm />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700 text-xs">
              <th className="px-4 py-3 text-left">名前</th>
              <th className="px-4 py-3 text-left">メールアドレス</th>
              <th className="px-4 py-3 text-left">権限</th>
              <th className="px-4 py-3" colSpan={3}></th>
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
                  {isAdmin && <TempPasswordButton id={staff.id} name={staff.name} />}
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
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
