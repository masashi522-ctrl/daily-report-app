import type { CSSProperties } from 'react'
import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import {
  FOOD_TYPE_LABELS,
  BATHING_LABELS,
  type FoodType,
  type BathingStatus,
  type DailyRecord,
} from '@/types/database'
import PrintActions from './print-actions'

const thStyle: CSSProperties = {
  padding: '4px 3px',
  textAlign: 'center',
  fontWeight: '600',
  fontSize: '9px',
  lineHeight: '1.4',
  border: '1px solid #93c5fd',
  backgroundColor: '#dbeafe',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '3px 4px',
  fontSize: '9px',
  lineHeight: '1.4',
  border: '1px solid #e5e7eb',
  verticalAlign: 'middle',
}

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]
  const date = params.date || today

  const { data: residents } = await supabase
    .from('Resident')
    .select('*')
    .eq('isActive', true)
    .eq('facilityId', session.facilityId)
    .order('sortOrder')
    .order('name')

  const residentIds = (residents ?? []).map(r => r.id)
  const { data: records } = residentIds.length > 0
    ? await supabase.from('DailyRecord').select('*').eq('date', date).in('residentId', residentIds)
    : { data: [] }

  const recordMap = new Map<string, DailyRecord>()
  records?.forEach(r => recordMap.set(r.residentId, r))

  const displayDate = new Date(date + 'T00:00:00')
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const dateLabel = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${dayNames[displayDate.getDay()]}）`

  const list = residents ?? []
  const recordCount = records?.length ?? 0

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print { .print\\:hidden { display: none !important; } body { background: white; } }
        body { font-family: 'Yu Gothic', 'Meiryo', 'MS Gothic', sans-serif; }
      `}</style>

      <PrintActions dateLabel={dateLabel} />

      <div className="p-4">
        <div className="flex items-center justify-between mb-2 print:mb-1">
          <h1 className="text-sm font-bold text-gray-800">
            デイサービス日次記録　{dateLabel}
          </h1>
          <p className="text-xs text-gray-500">{recordCount}/{list.length}名 記録済</p>
        </div>

        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '8%' }} />   {/* 名前 */}
            <col style={{ width: '7%' }} />   {/* 血圧AM */}
            <col style={{ width: '7%' }} />   {/* 血圧PM */}
            <col style={{ width: '6%' }} />   {/* 脈拍 */}
            <col style={{ width: '6%' }} />   {/* 体温 */}
            <col style={{ width: '4%' }} />   {/* 入浴 */}
            <col style={{ width: '5.5%' }} /> {/* 食事 */}
            <col style={{ width: '6%' }} />   {/* 水分 */}
            <col style={{ width: '4%' }} />   {/* 朝薬 */}
            <col style={{ width: '4%' }} />   {/* 昼前 */}
            <col style={{ width: '4%' }} />   {/* 昼後 */}
            <col style={{ width: '4%' }} />   {/* 夕薬 */}
            <col style={{ width: '4%' }} />   {/* 口腔 */}
            <col style={{ width: '13.5%' }} />{/* 備考 */}
            <col style={{ width: '17%' }} />  {/* 特記 */}
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>名前</th>
              <th style={thStyle}>血圧AM<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>収/拡</span></th>
              <th style={thStyle}>血圧PM<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>収/拡</span></th>
              <th style={thStyle}>脈拍<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>AM/PM</span></th>
              <th style={thStyle}>体温℃<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>AM/PM</span></th>
              <th style={thStyle}>入浴</th>
              <th style={thStyle}>食事<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>主/副</span></th>
              <th style={thStyle}>水分ml<br /><span style={{ fontSize: '8px', color: '#6b7280', fontWeight: 'normal' }}>AM/PM</span></th>
              <th style={thStyle}>朝薬</th>
              <th style={thStyle}>昼前</th>
              <th style={thStyle}>昼後</th>
              <th style={thStyle}>夕薬</th>
              <th style={thStyle}>口腔</th>
              <th style={thStyle}>備考</th>
              <th style={thStyle}>特記事項</th>
            </tr>
          </thead>
          <tbody>
            {list.map((resident, i) => {
              const r = recordMap.get(resident.id)
              const rowBg = i % 2 === 0 ? '#ffffff' : '#f9fafb'
              const center: CSSProperties = { ...tdStyle, textAlign: 'center', backgroundColor: rowBg }
              const left: CSSProperties = { ...tdStyle, backgroundColor: rowBg }
              return (
                <tr key={resident.id}>
                  <td style={left}>
                    <div style={{ fontWeight: '600', fontSize: '9px' }}>{resident.name}</div>
                    {resident.foodType && (
                      <div style={{ fontSize: '8px', color: '#6b7280' }}>
                        {resident.foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('/')}
                      </div>
                    )}
                    {resident.foodRestrictions && (
                      <div style={{ fontSize: '8px', color: '#ef4444' }}>{resident.foodRestrictions}</div>
                    )}
                  </td>
                  <td style={center}>
                    {r?.bpSystolic && r?.bpDiastolic
                      ? `${r.bpSystolic}/${r.bpDiastolic}`
                      : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>
                    {r?.bpSystolicPm && r?.bpDiastolicPm
                      ? `${r.bpSystolicPm}/${r.bpDiastolicPm}`
                      : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>
                    {r ? `${r.pulse ?? '-'}/${r.pulsePm ?? '-'}` : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>
                    {r ? `${r.tempMorning ?? '-'}/${r.tempAfternoon ?? '-'}` : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>
                    {r ? BATHING_LABELS[r.bathing as BathingStatus] : <span style={{ color: '#d1d5db' }}>-</span>}
                  </td>
                  <td style={center}>
                    {r?.mealMainFood != null || r?.mealSideFood != null
                      ? `${r.mealMainFood ?? '-'}/${r.mealSideFood ?? '-'}`
                      : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>
                    {r?.fluidIntakeAm != null || r?.fluidIntakePm != null
                      ? `${r.fluidIntakeAm ?? '-'}/${r.fluidIntakePm ?? '-'}`
                      : <span style={{ color: '#d1d5db' }}>-/-</span>}
                  </td>
                  <td style={center}>{r?.medicationMorning ? '○' : <span style={{ color: '#d1d5db' }}>-</span>}</td>
                  <td style={center}>{r?.medicationBeforeLunch ? '○' : <span style={{ color: '#d1d5db' }}>-</span>}</td>
                  <td style={center}>{r?.medicationAfterLunch ? '○' : <span style={{ color: '#d1d5db' }}>-</span>}</td>
                  <td style={center}>{r?.medicationEvening ? '○' : <span style={{ color: '#d1d5db' }}>-</span>}</td>
                  <td style={center}>{r?.oralCare ? '○' : <span style={{ color: '#d1d5db' }}>-</span>}</td>
                  <td style={left}>{r?.oralCareNote ?? ''}</td>
                  <td style={left}>{r?.specialNotes ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ marginTop: '8px', fontSize: '8px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
          <span>印刷日時: {new Date().toLocaleString('ja-JP')}</span>
          <span>{session.facilityName}</span>
        </div>
      </div>
    </>
  )
}
