import { requireSession } from '@/lib/session'
import { logout } from '@/app/actions/auth'
import Link from 'next/link'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold tracking-wide">デイサービス管理</h1>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <Link href="/dashboard" className="px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">日次記録</Link>
              <Link href="/residents" className="px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">利用者管理</Link>
              <Link href="/history" className="px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">過去記録</Link>
              <Link href="/analytics" className="px-3 py-1.5 rounded-lg hover:bg-blue-600 transition">集計・分析</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-blue-200">{session.name}</span>
            <form action={logout}>
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 transition text-xs">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        {/* モバイルナビ */}
        <nav className="sm:hidden flex text-xs border-t border-blue-600">
          {[
            { href: '/dashboard', label: '日次記録' },
            { href: '/residents', label: '利用者' },
            { href: '/history', label: '過去記録' },
            { href: '/analytics', label: '集計' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="flex-1 text-center py-2 hover:bg-blue-600 transition">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-2 sm:px-4 py-4">
        {children}
      </main>
    </div>
  )
}
