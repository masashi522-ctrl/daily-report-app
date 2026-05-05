'use client'

import { useState, useActionState, useEffect } from 'react'
import { updateStaff } from './actions'

type Staff = { id: string; name: string; email: string; role: string }

export default function EditButton({ staff, isAdmin }: { staff: Staff; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateStaff, null)

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition"
      >
        編集
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4">スタッフ情報の編集</h3>

            {state?.error && (
              <p className="mb-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-100">{state.error}</p>
            )}

            <form action={action} className="space-y-3">
              <input type="hidden" name="id" value={staff.id} />

              <div>
                <label className="text-xs text-gray-600 block mb-1">名前</label>
                <input name="name" type="text" required defaultValue={staff.name}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">メールアドレス</label>
                <input name="email" type="email" required defaultValue={staff.email}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">新しいパスワード（変更しない場合は空欄）</label>
                <input name="password" type="password" minLength={6} placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>

              {isAdmin && (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">権限</label>
                  <select name="role" defaultValue={staff.role}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                    <option value="STAFF">スタッフ</option>
                    <option value="ADMIN">管理者</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={pending}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                  {pending ? '更新中...' : '更新する'}
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
