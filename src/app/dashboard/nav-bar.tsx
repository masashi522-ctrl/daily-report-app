'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Users, BookOpen, BarChart2, UserCog, Bath, Dumbbell } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard',       label: '日次記録',   mobileLabel: '日次',   icon: ClipboardList, exact: true },
  { href: '/bathing',         label: '入浴',       mobileLabel: '入浴',   icon: Bath },
  { href: '/training',        label: '機能訓練',   mobileLabel: '訓練',   icon: Dumbbell },
  { href: '/residents',       label: '利用者管理', mobileLabel: '利用者', icon: Users },
  { href: '/history',         label: '過去記録',   mobileLabel: '過去',   icon: BookOpen },
  { href: '/analytics',       label: '集計・分析', mobileLabel: '集計',   icon: BarChart2 },
  { href: '/dashboard/staff', label: 'スタッフ',   mobileLabel: 'スタッフ', icon: UserCog },
]

export function DesktopNav() {
  const pathname = usePathname()
  return (
    <nav className="hidden sm:flex items-center gap-0.5 flex-wrap">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-teal-50 hover:bg-white/20 hover:text-white'
            }`}
          >
            <Icon size={13} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="sm:hidden flex border-t border-teal-400/40 overflow-x-auto">
      {NAV_ITEMS.map(({ href, mobileLabel, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex-none flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-all ${
              active
                ? 'bg-white/95 text-teal-700'
                : 'text-teal-50 hover:bg-white/15 hover:text-white'
            }`}
          >
            <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
            {mobileLabel}
          </Link>
        )
      })}
    </nav>
  )
}
