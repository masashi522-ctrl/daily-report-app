'use client'

import Link from 'next/link'

const MONTH_CHOICES = [3, 6, 12]

export default function WeightPrintActions({
  residentId,
  months,
  backHref,
}: {
  residentId: string
  months: number
  backHref: string
}) {
  const href = (m: number) =>
    `/print/weight?months=${m}${residentId ? `&residentId=${residentId}` : ''}`

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b border-gray-200 sticky top-0 z-10 print:hidden">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">期間</span>
        {MONTH_CHOICES.map(m => (
          <Link key={m} href={href(m)}
            className={`px-2.5 py-1 text-sm rounded-lg border transition ${
              m === months
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white border-gray-300 hover:border-teal-400'
            }`}>
            直近{m}ヶ月
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-gray-400 hidden sm:inline">
          {months > 6 ? 'A4横' : 'A4縦'}・PDFで保存するには印刷先に「PDFとして保存」を選びます
        </span>
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
