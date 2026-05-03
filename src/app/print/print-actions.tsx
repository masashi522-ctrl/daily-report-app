'use client'

import { useEffect } from 'react'

export default function PrintActions({ dateLabel }: { dateLabel: string }) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b sticky top-0 z-10 print:hidden"
    >
      <span className="text-sm font-semibold text-gray-700">{dateLabel}</span>
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-gray-400">※印刷設定で「横向き」を選択してください</span>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
