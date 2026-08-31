'use client'

import { useState } from 'react'
import type { DayNames } from '@/lib/monthly-daily-stats'

export interface DailyTableRow {
  date: string
  day: number
  dow: number
  total: number
  care: number
  support: number
  hours: string
  pickupDropCount: number
  names: DayNames
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

// 欠席者の区分は、表の要介護・要支援の列と同じ色で示して一目で分かるようにする
const CARE_BADGE: Record<string, string> = {
  要介護: 'bg-rose-50 text-rose-700',
  要支援: 'bg-sky-50 text-sky-700',
  区分未設定: 'bg-gray-100 text-gray-500',
}

/** 「要介護2・要支援1」のような内訳。1区分だけの日は出さない */
function absentBreakdown(absent: { care: string }[]): string {
  const counts = new Map<string, number>()
  for (const a of absent) counts.set(a.care, (counts.get(a.care) ?? 0) + 1)
  if (counts.size <= 1) return ''
  return ['要介護', '要支援', '区分未設定']
    .filter(k => counts.has(k))
    .map(k => `${k}${counts.get(k)}`)
    .join('・')
}

function NameGroup({ label, names, color }: { label: string; names: string[]; color: string }) {
  if (names.length === 0) return null
  return (
    <div className="flex gap-2 items-baseline">
      <span className={`shrink-0 text-xs font-medium ${color}`}>{label}（{names.length}名）</span>
      <span className="text-xs text-gray-700 leading-relaxed">{names.join('、')}</span>
    </div>
  )
}

export default function DailyTableBody({ rows }: { rows: DailyTableRow[] }) {
  // 開いている日付。1日ずつ開閉できるよう、集合で持つ
  const [openDates, setOpenDates] = useState<Set<string>>(new Set())

  function toggle(date: string) {
    setOpenDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <tbody>
      {rows.map(r => {
        const isSun = r.dow === 0
        const isSat = r.dow === 6
        const open = openDates.has(r.date)
        const hasNames = r.names.care.length + r.names.support.length + r.names.unset.length + r.names.absent.length > 0
        return [
          <tr
            key={r.date}
            onClick={() => hasNames && toggle(r.date)}
            className={`border-b border-gray-50 ${hasNames ? 'cursor-pointer hover:bg-gray-50' : ''} ${open ? 'bg-gray-50' : ''}`}
          >
            <td className={`py-1.5 tabular-nums ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
              {hasNames && (
                <span className="text-gray-400 text-[10px] mr-1 print:hidden">{open ? '▼' : '▶'}</span>
              )}
              {r.day}日<span className="text-xs ml-1">（{DOW[r.dow]}）</span>
            </td>
            <td className="py-1.5 text-right px-2 font-medium text-gray-800 tabular-nums">{r.total}</td>
            <td className="py-1.5 text-right px-2 text-rose-700 tabular-nums">{r.care}</td>
            <td className="py-1.5 text-right px-2 text-sky-700 tabular-nums">{r.support}</td>
            <td className="py-1.5 text-right px-2 text-gray-700 tabular-nums">{r.hours}</td>
            <td className={`py-1.5 text-right pl-2 tabular-nums ${r.pickupDropCount > 0 ? 'text-amber-700 font-medium' : 'text-gray-300'}`}>
              {r.pickupDropCount > 0 ? r.pickupDropCount : '―'}
            </td>
          </tr>,
          // 印刷する月次報告の体裁は変えないため、開いた内訳は画面だけに出す
          open ? (
            <tr key={`${r.date}-detail`} className="border-b border-gray-100 bg-gray-50 print:hidden">
              <td colSpan={6} className="py-2 px-3">
                <div className="flex flex-col gap-1.5">
                  <NameGroup label="要介護" names={r.names.care} color="text-rose-700" />
                  <NameGroup label="要支援" names={r.names.support} color="text-sky-700" />
                  <NameGroup label="区分未設定" names={r.names.unset} color="text-gray-500" />
                  {r.names.absent.length > 0 && (
                    <div className="flex gap-2 items-baseline flex-wrap">
                      <span className="shrink-0 text-xs font-medium text-amber-700">
                        欠席（{r.names.absent.length}名
                        {absentBreakdown(r.names.absent) && `：${absentBreakdown(r.names.absent)}`}）
                      </span>
                      <span className="flex gap-x-3 gap-y-1 flex-wrap">
                        {r.names.absent.map(a => (
                          <span key={a.name} className="text-xs text-gray-700 inline-flex items-center gap-1">
                            {a.name}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${CARE_BADGE[a.care] ?? CARE_BADGE['区分未設定']}`}>
                              {a.care}
                            </span>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ) : null,
        ]
      })}
    </tbody>
  )
}
