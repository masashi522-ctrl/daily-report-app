'use client'

import { useActionState } from 'react'
import { facilityLogin } from '@/app/actions/auth'
import Link from 'next/link'

export default function FacilityLoginForm({ slug }: { slug: string }) {
  const boundFacilityLogin = facilityLogin.bind(null, slug)
  const [state, action, pending] = useActionState(boundFacilityLogin, null)

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-100">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-stone-700">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-3 focus:ring-amber-100 transition placeholder:text-stone-300"
          placeholder="example@email.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-stone-700">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-3 focus:ring-amber-100 transition placeholder:text-stone-300"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-500 active:bg-amber-700 transition shadow-sm shadow-amber-200 disabled:opacity-60"
      >
        {pending ? 'ログイン中...' : 'ログイン'}
      </button>

      <p className="text-center text-xs text-stone-400">
        アカウントをお持ちでない方は{' '}
        <Link href="/register" className="text-amber-600 hover:underline">新規登録</Link>
      </p>
    </form>
  )
}
