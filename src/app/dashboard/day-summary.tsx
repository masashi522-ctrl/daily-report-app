import { formatHours, type DaySummary } from '@/lib/attendance-stats'

/** 日次記録の見出しの下に出す、その日の利用状況 */
export default function DaySummaryBar({ summary }: { summary: DaySummary }) {
  const items = [
    { label: '利用者数', value: `${summary.total}名`, tone: 'main' as const },
    { label: '要介護', value: `${summary.care}名`, tone: 'care' as const },
    { label: '要支援', value: `${summary.support}名`, tone: 'support' as const },
    { label: '平均提供時間', value: formatHours(summary.avgHours), tone: 'plain' as const },
  ]

  const toneCls = {
    main:    'bg-white border-gray-200 text-gray-800',
    care:    'bg-rose-50 border-rose-200 text-rose-800',
    support: 'bg-sky-50 border-sky-200 text-sky-800',
    plain:   'bg-white border-gray-200 text-gray-800',
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(it => (
        <div key={it.label}
          className={`flex items-baseline gap-2 rounded-lg border px-3 py-1.5 ${toneCls[it.tone]}`}>
          <span className="text-[11px] font-medium opacity-70">{it.label}</span>
          <span className="text-base font-bold tabular-nums">{it.value}</span>
        </div>
      ))}
      {summary.unset > 0 && (
        <div className="flex items-baseline gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-500">
          <span className="text-[11px] font-medium opacity-70">介護度未設定</span>
          <span className="text-base font-bold tabular-nums">{summary.unset}名</span>
        </div>
      )}
      {(summary.hoursFromNotes > 0 || summary.pickupDropCount > 0 || summary.hoursUnknown > 0) && (
        <div className="w-full text-[11px] text-gray-400 flex flex-col gap-0.5">
          {summary.hoursFromNotes > 0 && (
            <p>※ 特記事項の記載により {summary.hoursFromNotes}名 の提供時間を変更して計算しています</p>
          )}
          {summary.pickupDropCount > 0 && (
            <p>※ 特記事項から読み取った送迎減 {summary.pickupDropCount}回（月次報告に集計されます）</p>
          )}
          {summary.hoursUnknown > 0 && (
            <p>※ 平均提供時間は、提供時刻または時間区分が分かる {summary.total - summary.hoursUnknown}名 で計算しています</p>
          )}
        </div>
      )}
    </div>
  )
}
