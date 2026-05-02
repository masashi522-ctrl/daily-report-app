import RegisterForm from './register-form'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 shadow-sm mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">アカウント作成</h1>
          <p className="text-sm text-stone-500 mt-1">デイサービス管理システム</p>
        </div>

        <div className="bg-white rounded-3xl shadow-md border border-amber-100 px-8 py-8">
          <RegisterForm />
        </div>
      </div>
    </div>
  )
}
