import { requireSession } from '@/lib/session'
import { logout } from '@/app/actions/auth'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { DesktopNav, MobileNav } from './nav-bar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white shadow-lg">
        {/* メインヘッダー行 */}
        <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-4">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="bg-white/20 rounded-lg p-1.5">
              <Activity size={18} strokeWidth={2.5} />
            </span>
            <span className="text-base font-bold tracking-wide">デイサービス管理</span>
          </Link>

          {/* デスクトップナビ（タイトルの右） */}
          <div className="flex-1 flex justify-center">
            <DesktopNav />
          </div>

          {/* ユーザー・ログアウト */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-blue-200 text-sm">{session.name}</span>
            <form action={logout}>
              <button type="submit"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition text-xs font-medium border border-white/20">
                ログアウト
              </button>
            </form>
          </div>
        </div>

        {/* モバイルボトムナビ */}
        <MobileNav />
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-2 sm:px-4 py-4">
        {children}
      </main>
    </div>
  )
}
