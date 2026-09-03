'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// 月次報告は過去の月も見られる。months は新しい順で、先頭が今月
export default function MonthPicker({ months, selected }: { months: string[]; selected: string }) {
  const router = useRouter()
  const index = months.indexOf(selected)

  function go(month: string | undefined) {
    if (month) router.push(`/monthly-report?month=${month}`)
  }

  function label(month: string) {
    const [y, m] = month.split('-')
    return `${y}年${parseInt(m)}月${month === months[0] ? '（今月）' : ''}`
  }

  const btn = 'shrink-0 p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="flex items-center gap-1.5 print:hidden">
      <button type="button" onClick={() => go(months[index + 1])} disabled={index + 1 >= months.length}
        className={btn} aria-label="前の月">
        <ChevronLeft size={16} />
      </button>
      <select value={selected} onChange={e => go(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
        {months.map(m => <option key={m} value={m}>{label(m)}</option>)}
      </select>
      <button type="button" onClick={() => go(months[index - 1])} disabled={index <= 0}
        className={btn} aria-label="次の月">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
