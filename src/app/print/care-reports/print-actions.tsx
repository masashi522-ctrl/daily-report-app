'use client'

import Link from 'next/link'

export default function CareReportsPrintActions({
  count,
  backHref,
}: {
  count: number
  backHref: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b border-gray-200 sticky top-0 z-10 print:hidden">
      <span className="text-sm font-semibold text-gray-700">月次報告書 まとめて印刷</span>
      <span className="text-xs text-gray-500">{count}名分</span>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-gray-400 hidden sm:inline">お一人ずつ新しい用紙から始まります（両面印刷でも裏面に別の方は入りません）</span>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷 / PDF保存
        </button>
        <Link href={backHref}
          className="px-4 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          戻る
        </Link>
      </div>
    </div>
  )
}
