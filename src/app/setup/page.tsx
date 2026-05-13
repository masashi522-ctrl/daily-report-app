export const dynamic = 'force-dynamic'

import SetupForm from './setup-form'

export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">新規施設登録</h1>
          <p className="text-sm text-gray-500 mt-1">施設名と管理者アカウントを作成します</p>
        </div>
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-8 py-8">
          <SetupForm />
        </div>
      </div>
    </div>
  )
}
