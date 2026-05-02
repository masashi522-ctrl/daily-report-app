'use client'

import { useActionState } from 'react'
import { register } from './actions'
import Link from 'next/link'

export default function RegisterForm() {
  const [state, action, pending] = useActionState(register, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-100">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">名前</label>
        <input name="name" type="text" required
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white transition"
          placeholder="山田 太郎" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">メールアドレス</label>
        <input name="email" type="email" required
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white transition"
          placeholder="example@email.com" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">パスワード（6文字以上）</label>
        <input name="password" type="password" required minLength={6}
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white transition"
          placeholder="••••••••" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">パスワード（確認）</label>
        <input name="confirm" type="password" required minLength={6}
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white transition"
          placeholder="••••••••" />
      </div>

      <button type="submit" disabled={pending}
        className="mt-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-500 transition disabled:opacity-60">
        {pending ? '登録中...' : 'アカウントを作成'}
      </button>

      <p className="text-center text-xs text-stone-400">
        すでにアカウントをお持ちの方は{' '}
        <Link href="/login" className="text-amber-600 hover:underline">ログイン</Link>
      </p>
    </form>
  )
}
