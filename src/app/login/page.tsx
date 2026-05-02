import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 shadow-sm mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">デイサービス管理</h1>
          <p className="text-sm text-stone-500 mt-1">今日もお疲れさまです</p>
        </div>

        <div className="bg-white rounded-3xl shadow-md border border-amber-100 px-8 py-8">
          <LoginForm />
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          デイサービス バイタル・ケア記録システム
        </p>
      </div>
    </div>
  )
}
