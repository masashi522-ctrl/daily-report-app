'use client'

import Link from 'next/link'

export default function DailyPrintActions({
  year,
  month,
  prev,
  next,
}: {
  year: number
  month: number
  prev: { year: number; month: number }
  next: { year: number; month: number }
}) {
  const href = (t: { year: number; month: number }) =>
    `/print/monthly-daily?year=${t.year}&month=${t.month}`

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b border-gray-200 sticky top-0 z-10 print:hidden">
      <div className="flex items-center gap-1.5">
        <Link href={href(prev)}
          className="px-2.5 py-1 text-sm rounded-lg border border-gray-300 bg-white hover:border-teal-400 transition">◀ 前月</Link>
        <span className="text-sm font-semibold text-gray-700 tabular-nums px-1">{year}年{month}月</span>
        <Link href={href(next)}
          className="px-2.5 py-1 text-sm rounded-lg border border-gray-300 bg-white hover:border-teal-400 transition">翌月 ▶</Link>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-gray-400 hidden sm:inline">A4縦・1ページに収まります</span>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷 / PDF保存
        </button>
        <Link href="/monthly-report"
          className="px-4 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          戻る
        </Link>
      </div>
    </div>
  )
}
