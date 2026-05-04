'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Users, BookOpen, BarChart2, UserCog } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard',       label: '日次記録',   mobileLabel: '日次',   icon: ClipboardList, exact: true },
  { href: '/residents',       label: '利用者管理', mobileLabel: '利用者', icon: Users },
  { href: '/history',         label: '過去記録',   mobileLabel: '過去',   icon: BookOpen },
  { href: '/analytics',       label: '集計・分析', mobileLabel: '集計',   icon: BarChart2 },
  { href: '/dashboard/staff', label: 'スタッフ',   mobileLabel: 'スタッフ', icon: UserCog },
]

function useActive(href: string, exact?: boolean) {
  const pathname = usePathname()
  if (exact) return pathname === href
  return pathname.startsWith(href)
}

export function DesktopNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden sm:flex items-center gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-blue-100 hover:bg-blue-600 hover:text-white'
            }`}
          >
            <Icon size={14} strokeWidth={active ? 2.5 : 1.8} />
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
    <nav className="sm:hidden flex border-t border-blue-600">
      {NAV_ITEMS.map(({ href, mobileLabel, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-all ${
              active
                ? 'bg-white text-blue-700'
                : 'text-blue-200 hover:bg-blue-600 hover:text-white'
            }`}
          >
            <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
            {mobileLabel}
          </Link>
        )
      })}
    </nav>
  )
}
