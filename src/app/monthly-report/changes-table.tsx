import { SERVICE_TIME_CATEGORY_LABELS } from '@/types/database'
import type { MonthlyChanges } from '@/lib/monthly-changes'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

/** 「1,3,5」→「月・水・金」 */
function daysLabel(days: string | null) {
  if (!days) return null
  return days
    .split(',')
    .map(d => DOW[parseInt(d)])
    .filter(Boolean)
    .join('・')
}

/** 提供時間区分と利用曜日をまとめた「利用予定」の欄 */
function schedule(category: string | null, attendanceDays: string | null) {
  const parts = [
    category ? (SERVICE_TIME_CATEGORY_LABELS[category] ?? category) : null,
    daysLabel(attendanceDays),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : null
}

/** 「2026-09-04」→「9/4」。年は見出しに出ているので省く */
function md(date: string) {
  return `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8, 10))}`
}

function Empty() {
  return <span className="text-gray-300">―</span>
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 font-medium whitespace-nowrap ${i === 0 ? 'text-left' : 'text-left px-2'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Block({ title, count, empty, children }: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-600 mb-1.5">
        {title}
        <span className="ml-1.5 font-normal text-gray-400">{count}名</span>
      </h4>
      {count === 0 ? <p className="text-xs text-gray-400 py-2">{empty}</p> : children}
    </div>
  )
}

export default function MonthlyChangesTable({
  changes,
  isCurrentMonth,
}: {
  changes: MonthlyChanges
  isCurrentMonth: boolean
}) {
  const { hospitalized, serviceEnds, serviceStarts } = changes
  // 同じ方が月内に2回入院することもあるため、人数は氏名の重複を除いて数える
  const hospitalizedCount = new Set(hospitalized.map(h => h.id)).size

  const cell = 'py-1.5 px-2 align-top'
  const nameCell = 'py-1.5 align-top whitespace-nowrap font-medium text-gray-800'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print-block">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">当月の入院・利用中止・新規利用開始</h3>
      <p className="text-[10px] text-gray-400 mb-3">
        入院 {hospitalizedCount}名 ・ 利用中止 {serviceEnds.length}名 ・ 新規利用開始 {serviceStarts.length}名
        {' ／ '}
        {isCurrentMonth
          ? `入院日数は ${changes.until.replace(/-/g, '/')} 時点までを数えています`
          : `${changes.month}月末時点の内容です`}
      </p>

      <div className="flex flex-col gap-4">
        <Block title="入院者" count={hospitalized.length} empty="当月に入院された方はいません">
          <Table head={['氏名', '介護度', '利用予定', '入院期間・利用再開日', '当月の休止日数', '状態', '入院理由']}>
            {hospitalized.map((h, i) => (
              <tr key={`${h.id}-${i}`} className="border-b border-gray-50">
                <td className={nameCell}>{h.name}</td>
                <td className={cell}>{h.careLevel ?? <Empty />}</td>
                <td className={cell}>{schedule(h.serviceTimeCategory, h.attendanceDays) ?? <Empty />}</td>
                {/* 入院日は前の月・前の年のこともあるため、年から省かずに出す */}
                <td className={`${cell} whitespace-nowrap`}>
                  <div>
                    {h.admissionDate.replace(/-/g, '/')} 〜{' '}
                    {h.dischargeDate ? h.dischargeDate.replace(/-/g, '/') : <span className="text-gray-400">未定</span>}
                  </div>
                  {h.dischargeDate && (
                    <div className="text-[11px] text-gray-500">
                      {h.resumeDate
                        ? `再開 ${h.resumeDate.replace(/-/g, '/')}`
                        : h.estimatedResumeDate
                          ? `再開 ${h.estimatedResumeDate.replace(/-/g, '/')}（記録から）`
                          : '再開日 未入力'}
                    </div>
                  )}
                </td>
                <td className={`${cell} tabular-nums whitespace-nowrap`}>
                  <div>{h.awayDaysInMonth}日</div>
                  {h.awayDaysInMonth !== h.hospitalDaysInMonth && (
                    <div className="text-[11px] text-gray-500">うち入院 {h.hospitalDaysInMonth}日</div>
                  )}
                </td>
                <td className={cell}>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                    h.status === 'RESUMED' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {/* 再開日が未入力のときは、退院日をもって戻ったことにしているので「再開」とは言い切らない */}
                    {h.status === 'HOSPITALIZED'
                      ? '入院中'
                      : h.status === 'RESTING'
                        ? `${md(h.dischargeDate!)} 退院・再開待ち`
                        : h.resumeDate
                          ? `${md(h.resumeDate)} 再開`
                          : `${md(h.dischargeDate!)} 退院`}
                  </span>
                </td>
                <td className={cell}>{h.reason ?? <Empty />}</td>
              </tr>
            ))}
          </Table>
        </Block>

        <Block title="利用中止者" count={serviceEnds.length} empty="当月に利用を中止された方はいません">
          <Table head={['氏名', '介護度', '利用予定', '利用期間', '最終利用日', '当月の利用回数', '中止理由']}>
            {serviceEnds.map(e => (
              <tr key={e.id} className="border-b border-gray-50">
                <td className={nameCell}>{e.name}</td>
                <td className={cell}>{e.careLevel ?? <Empty />}</td>
                <td className={cell}>{schedule(e.serviceTimeCategory, e.attendanceDays) ?? <Empty />}</td>
                <td className={`${cell} whitespace-nowrap`}>
                  {e.serviceStartDate ? e.serviceStartDate.replace(/-/g, '/') : <Empty />} 〜{' '}
                  {e.serviceEndDate.replace(/-/g, '/')}
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  {e.lastVisitDate ? e.lastVisitDate.replace(/-/g, '/') : <Empty />}
                </td>
                <td className={`${cell} tabular-nums`}>{e.visitsInMonth}回</td>
                <td className={cell}>{e.reason ?? <Empty />}</td>
              </tr>
            ))}
          </Table>
        </Block>

        <Block title="新規利用開始者" count={serviceStarts.length} empty="当月に利用を開始された方はいません">
          <Table head={['氏名', '介護度', '利用予定', '利用開始日', '初回利用日', '当月の利用回数']}>
            {serviceStarts.map(s => (
              <tr key={s.id} className="border-b border-gray-50">
                <td className={nameCell}>{s.name}</td>
                <td className={cell}>{s.careLevel ?? <Empty />}</td>
                <td className={cell}>{schedule(s.serviceTimeCategory, s.attendanceDays) ?? <Empty />}</td>
                <td className={`${cell} whitespace-nowrap`}>{s.serviceStartDate.replace(/-/g, '/')}</td>
                <td className={`${cell} whitespace-nowrap`}>
                  {s.firstVisitDate ? s.firstVisitDate.replace(/-/g, '/') : <span className="text-gray-400">未利用</span>}
                </td>
                <td className={`${cell} tabular-nums`}>{s.visitsInMonth}回</td>
              </tr>
            ))}
          </Table>
        </Block>
      </div>

      <div className="text-[10px] text-gray-400 mt-3 flex flex-col gap-0.5">
        <p>入院者は、利用者登録の「入退院期間」が当月にかかっている方です。同じ方が月内に2回入院された場合は2行に分かれます。</p>
        <p>退院した日にそのまま利用を再開できるとは限らないため、休止日数は利用再開日の前日までを数えています。再開日が未入力のときは、退院日に再開したものとして数えます。</p>
        <p>「（記録から）」は、利用再開日が未入力の方について、退院後に最初の記録があった日を拾ったものです（翌月になることもあります）。表示だけに使い、稼働率や予測には反映していません。実際の再開日を利用者登録に入れると、集計にも反映されます。</p>
        <p>入院中と、退院後まだ再開していない間は、稼働率の集計と翌月予測の利用予定から除いています。</p>
        <p>利用中止者・新規利用開始者は、利用者登録の「利用中止日」「利用開始日」が当月に入っている方です。</p>
        <p>最終利用日・利用回数は、欠席の日を除いて数えています（最終利用日は当月より前のこともあります）。</p>
        <p>介護度・利用予定は、現在の登録内容を表示しています。</p>
      </div>
    </div>
  )
}
