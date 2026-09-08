import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import {
  clampMonths,
  loadFacilityWeightReport,
  loadResidentWeightReport,
} from '@/lib/weight-report'
import WeightPrintActions from './print-actions'

// 体重推移をそのまま印刷・PDF保存するための画面。
// 利用者を選んでいれば日ごとの推移、選んでいなければ全利用者の月ごとの推移を出す。

function jstToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function jstNowLabel() {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

/** 「2026-08-21」→「8/21」 */
function md(date: string) {
  return `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8, 10))}`
}

/** 増減の符号付き表示。増加はオレンジ、減少は青 */
function Diff({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-300">―</span>
  return (
    <span className={value > 0 ? 'text-orange-600' : value < 0 ? 'text-blue-600' : 'text-gray-600'}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

export default async function WeightPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ residentId?: string; months?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = jstToday()

  const months = clampMonths(params.months)
  const residentId = params.residentId ?? ''
  const backHref = residentId ? `/weight?residentId=${residentId}` : '/weight'

  const [{ data: facility }, individual, facilityReport] = await Promise.all([
    supabase.from('Facility').select('name').eq('id', session.facilityId).maybeSingle(),
    residentId ? loadResidentWeightReport(session.facilityId, residentId, months, today) : null,
    residentId ? null : loadFacilityWeightReport(session.facilityId, months, today),
  ])

  // 他施設の利用者を指定された場合もここに来る
  if (residentId && !individual) {
    return (
      <div className="min-h-screen bg-gray-50">
        <WeightPrintActions residentId="" months={months} backHref="/weight" />
        <p className="text-sm text-gray-500 text-center py-20">
          利用者が見つかりません。体重の画面からもう一度お選びください。
        </p>
      </div>
    )
  }

  const monthList = individual?.months ?? facilityReport!.months
  const periodLabel = `${monthList[0].label} 〜 ${monthList[monthList.length - 1].label}`
  const title = individual ? `体重推移　${individual.resident.name} 様` : '体重推移　全利用者'

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white print:min-h-0">
      <style>{`
        @page { size: A4 ${months > 6 ? 'landscape' : 'portrait'}; margin: 14mm; }
        @media print {
          body { background: white; }
          .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; border: none; }
          /* 表が複数ページにまたがっても、各ページの先頭に見出し行を出す */
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <WeightPrintActions residentId={residentId} months={months} backHref={backHref} />

      <div className="sheet max-w-[210mm] mx-auto my-6 bg-white shadow-sm border border-gray-200 p-8 print:my-0">
        <div className="border-b-2 border-gray-800 pb-2 mb-4">
          <div className="flex items-end justify-between">
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{periodLabel}</p>
              <p className="text-xs text-gray-500">{facility?.name ?? ''}</p>
            </div>
          </div>
        </div>

        {individual ? (
          individual.rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">この期間に体重の記録がありません</p>
          ) : (
            <>
              <div className="flex items-baseline gap-6 mb-3">
                <span className="text-xs text-gray-500">
                  測定 <span className="text-base font-bold text-gray-800 tabular-nums">{individual.rows.length}</span> 回
                </span>
                <span className="text-xs text-gray-500">
                  期間内増減{' '}
                  <span className="text-base font-bold tabular-nums">
                    <Diff value={individual.change} />
                  </span>
                  <span className="ml-0.5">kg</span>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-300">
                    <th className="text-left py-1.5 font-medium">測定日</th>
                    <th className="text-right py-1.5 font-medium px-3">体重（kg）</th>
                    <th className="text-right py-1.5 font-medium">前回比（kg）</th>
                  </tr>
                </thead>
                <tbody>
                  {individual.rows.map(row => (
                    <tr key={row.date} className="border-b border-gray-100">
                      <td className="py-1.5 whitespace-nowrap">{row.date.replace(/-/g, '/')}</td>
                      <td className="py-1.5 text-right px-3 tabular-nums font-medium">{row.weight.toFixed(1)}</td>
                      <td className="py-1.5 text-right tabular-nums"><Diff value={row.diff} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        ) : facilityReport!.residents.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-16">この期間に体重の記録がありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-300">
                <th className="text-left py-1.5 font-medium">利用者名</th>
                {monthList.map(m => (
                  <th key={m.key} className="text-right py-1.5 font-medium px-2 whitespace-nowrap">
                    {parseInt(m.key.slice(5, 7))}月
                  </th>
                ))}
                <th className="text-right py-1.5 font-medium pl-2 whitespace-nowrap">増減</th>
              </tr>
            </thead>
            <tbody>
              {facilityReport!.residents.map(row => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-1.5 whitespace-nowrap">{row.name}</td>
                  {row.values.map((v, i) => (
                    <td key={monthList[i].key} className="py-1.5 text-right px-2 tabular-nums">
                      {v != null ? v.toFixed(1) : <span className="text-gray-300">―</span>}
                    </td>
                  ))}
                  <td className="py-1.5 text-right pl-2 tabular-nums font-medium"><Diff value={row.diff} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="text-[10px] text-gray-400 mt-3 flex flex-col gap-0.5">
          {individual ? (
            <p>前回比は、1つ前の測定日からの増減です。</p>
          ) : (
            <>
              <p>各月の値は、その月に最後に測定した体重です。測定が無い月は「―」にしています。</p>
              <p>増減は、測定のある最初の月から最後の月までの差です（2か月以上そろっている方のみ）。</p>
              <p>対象期間に在籍していた方を、ふりがな順に並べています。期間の途中で利用を終えた方も、測定値がある間は載せています。</p>
            </>
          )}
          <p>{md(today)} 時点 ・ 出力日時: {jstNowLabel()}</p>
        </div>
      </div>
    </div>
  )
}
