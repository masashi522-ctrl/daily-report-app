'use client'

import { useActionState } from 'react'
import { createStaff } from './actions'

export default function StaffForm() {
  const [state, action, pending] = useActionState(createStaff, null)

  return (
    <form action={action} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
      {state?.error && (
        <p className="w-full text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-100">{state.error}</p>
      )}
      {state?.success && (
        <p className="w-full text-green-600 text-sm bg-green-50 px-3 py-2 rounded-lg border border-green-100">{state.success}</p>
      )}
      <div>
        <label className="text-xs text-gray-600 block mb-1">名前</label>
        <input name="name" type="text" required placeholder="山田 太郎"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36" />
      </div>
      <div>
        <label className="text-xs text-gray-600 block mb-1">メールアドレス</label>
        <input name="email" type="email" required placeholder="example@email.com"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-52" />
      </div>
      <div>
        <label className="text-xs text-gray-600 block mb-1">パスワード（6文字以上）</label>
        <input name="password" type="password" required minLength={6} placeholder="••••••••"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36" />
      </div>
      <div>
        <label className="text-xs text-gray-600 block mb-1">権限</label>
        <select name="role" className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="STAFF">スタッフ</option>
          <option value="ADMIN">管理者</option>
        </select>
      </div>
      <button type="submit" disabled={pending}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60">
        {pending ? '作成中...' : 'アカウント追加'}
      </button>
    </form>
  )
}
