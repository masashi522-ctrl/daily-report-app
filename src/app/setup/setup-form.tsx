'use client'

import { useActionState } from 'react'
import { setupAdmin } from './actions'

export default function SetupForm() {
  const [state, action, pending] = useActionState(setupAdmin, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-100">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">施設名 *</label>
        <input name="facilityName" type="text" required
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white transition"
          placeholder="〇〇デイサービスセンター" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">事業所URL名 *</label>
        <input name="slug" type="text" required pattern="[a-z0-9\-]{2,30}"
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-mono outline-none focus:border-blue-400 focus:bg-white transition"
          placeholder="muraday" />
        <p className="text-xs text-gray-400">英小文字・数字・ハイフンのみ（例: muraday）</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">管理者名前</label>
        <input name="name" type="text" required
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white transition"
          placeholder="山田 太郎" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">メールアドレス</label>
        <input name="email" type="email" required
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white transition"
          placeholder="example@email.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">パスワード（6文字以上）</label>
        <input name="password" type="password" required minLength={6}
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white transition"
          placeholder="••••••••" />
      </div>
      <button type="submit" disabled={pending}
        className="mt-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-60">
        {pending ? '作成中...' : '施設と管理者アカウントを作成'}
      </button>
    </form>
  )
}
