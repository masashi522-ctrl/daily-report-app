import { login } from '@/app/actions/auth'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    redirect(session.role === 'admin' ? '/admin' : '/leader')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 px-4">
      <div className="w-full max-w-sm">
        {/* ロゴカード */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 shadow-sm mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">日報アプリ</h1>
          <p className="text-sm text-stone-500 mt-1">今日もお疲れさまです</p>
        </div>

        {/* フォームカード */}
        <div className="bg-white rounded-3xl shadow-md border border-amber-100 px-8 py-8">
          <LoginForm />
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          介護施設リーダー向け日報支援システム
        </p>
      </div>
    </div>
  )
}

function LoginForm() {
  return (
    <form action={login} className="flex flex-col gap-5">
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
        className="mt-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-500 active:bg-amber-700 transition shadow-sm shadow-amber-200"
      >
        ログイン
      </button>
    </form>
  )
}
