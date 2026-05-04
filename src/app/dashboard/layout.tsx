import { requireSession } from '@/lib/session'
import { logout } from '@/app/actions/auth'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { DesktopNav, MobileNav } from './nav-bar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f8f4ff 0%, #f0f7ff 50%, #f5f9f0 100%)' }}>
      <header className="shadow-lg" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #6366f1 100%)' }}>
        {/* メインヘッダー行 */}
        <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-4">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="bg-white/25 rounded-xl p-1.5 backdrop-blur-sm">
              <Activity size={18} strokeWidth={2.5} className="text-white" />
            </span>
            <span className="text-base font-bold tracking-wide text-white">デイサービス管理</span>
          </Link>

          {/* デスクトップナビ */}
          <div className="flex-1 flex justify-center">
            <DesktopNav />
          </div>

          {/* ユーザー・ログアウト */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-purple-200 text-sm">{session.name}</span>
            <form action={logout}>
              <button type="submit"
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition text-xs font-medium text-white border border-white/25 backdrop-blur-sm">
                ログアウト
              </button>
            </form>
          </div>
        </div>

        {/* モバイルナビ */}
        <MobileNav />
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-2 sm:px-4 py-4">
        {children}
      </main>
    </div>
  )
}
