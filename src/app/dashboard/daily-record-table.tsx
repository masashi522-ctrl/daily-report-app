'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type Resident, type DailyRecord, type BathingStatus } from '@/types/database'
import { saveRecord } from './actions'

interface Props {
  residents: Resident[]
  recordMap: Record<string, DailyRecord>
  date: string
}

type RecordDraft = Partial<DailyRecord>

export default function DailyRecordTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function getDraft(residentId: string): RecordDraft {
    return drafts[residentId] ?? recordMap[residentId] ?? {}
  }

  function updateDraft(residentId: string, field: string, value: unknown) {
    setDrafts(prev => ({
      ...prev,
      [residentId]: { ...getDraft(residentId), [field]: value },
    }))
  }

  async function handleSave(residentId: string) {
    setSaving(residentId)
    const draft = getDraft(residentId)
    const existing = recordMap[residentId]
    startTransition(async () => {
      await saveRecord({ ...draft, residentId, date, id: existing?.id })
      setSaving(null)
    })
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-blue-50 text-gray-700">
            <th className="sticky left-0 bg-blue-50 px-3 py-2 text-left font-semibold min-w-[100px]">名前</th>
            <th className="px-2 py-2 font-semibold min-w-[60px]">形態</th>
            <th className="px-2 py-2 font-semibold min-w-[100px]">血圧AM</th>
            <th className="px-2 py-2 font-semibold min-w-[100px]">血圧PM</th>
            <th className="px-2 py-2 font-semibold min-w-[50px]">脈拍AM</th>
            <th className="px-2 py-2 font-semibold min-w-[50px]">脈拍PM</th>
            <th className="px-2 py-2 font-semibold min-w-[55px]">体温AM</th>
            <th className="px-2 py-2 font-semibold min-w-[55px]">体温PM</th>
            <th className="px-2 py-2 font-semibold min-w-[50px]">入浴</th>
            <th className="px-2 py-2 font-semibold min-w-[100px]">食事量（主食/主菜）</th>
            <th className="px-2 py-2 font-semibold min-w-[55px]">水分AM</th>
            <th className="px-2 py-2 font-semibold min-w-[55px]">水分PM</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">朝薬</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">昼前</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">昼後</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">夕薬</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">機能</th>
            <th className="px-2 py-2 font-semibold min-w-[40px]">口腔</th>
            <th className="px-2 py-2 font-semibold min-w-[120px]">特記事項</th>
            <th className="px-2 py-2 font-semibold min-w-[60px]">保存</th>
          </tr>
        </thead>
        <tbody>
          {residents.map((resident, i) => {
            const d = getDraft(resident.id)
            const isSaved = !!recordMap[resident.id]
            const isDirty = !!drafts[resident.id]
            return (
              <tr key={resident.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition`}>
                <td className="sticky left-0 bg-inherit px-3 py-1.5 font-medium text-gray-800">
                  {resident.name}
                  {resident.foodRestrictions && (
                    <div className="text-red-500 text-[10px]">{resident.foodRestrictions}</div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-gray-600 text-center">{FOOD_TYPE_LABELS[resident.foodType]}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <input type="number" placeholder="収" value={d.bpSystolic ?? ''} onChange={e => updateDraft(resident.id, 'bpSystolic', e.target.value ? +e.target.value : null)}
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                    <span className="text-gray-400">/</span>
                    <input type="number" placeholder="拡" value={d.bpDiastolic ?? ''} onChange={e => updateDraft(resident.id, 'bpDiastolic', e.target.value ? +e.target.value : null)}
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <input type="number" placeholder="収" value={d.bpSystolicPm ?? ''} onChange={e => updateDraft(resident.id, 'bpSystolicPm', e.target.value ? +e.target.value : null)}
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                    <span className="text-gray-400">/</span>
                    <input type="number" placeholder="拡" value={d.bpDiastolicPm ?? ''} onChange={e => updateDraft(resident.id, 'bpDiastolicPm', e.target.value ? +e.target.value : null)}
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" value={d.pulse ?? ''} onChange={e => updateDraft(resident.id, 'pulse', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" value={d.pulsePm ?? ''} onChange={e => updateDraft(resident.id, 'pulsePm', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.1" value={d.tempMorning ?? ''} onChange={e => updateDraft(resident.id, 'tempMorning', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.1" value={d.tempAfternoon ?? ''} onChange={e => updateDraft(resident.id, 'tempAfternoon', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => updateDraft(resident.id, 'bathing', e.target.value)}
                    className="border border-gray-200 rounded px-1 py-0.5 text-xs w-16">
                    <option value="DONE">○</option>
                    <option value="NOT_DONE">×</option>
                    <option value="NOT_APPLICABLE">-</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <select value={d.mealMainFood ?? ''} onChange={e => updateDraft(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)}
                      className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                      <option value="">主食</option>
                      {[0,1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                    <span className="text-gray-400">/</span>
                    <select value={d.mealSideFood ?? ''} onChange={e => updateDraft(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)}
                      className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                      <option value="">主菜</option>
                      {[0,1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" value={d.fluidIntakeAm ?? ''} onChange={e => updateDraft(resident.id, 'fluidIntakeAm', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" value={d.fluidIntakePm ?? ''} onChange={e => updateDraft(resident.id, 'fluidIntakePm', e.target.value ? +e.target.value : null)}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" />
                </td>
                {(['medicationMorning', 'medicationBeforeLunch', 'medicationAfterLunch', 'medicationEvening'] as const).map(field => (
                  <td key={field} className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]} onChange={e => updateDraft(resident.id, field, e.target.checked)}
                      className="w-4 h-4 accent-blue-600" />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={!!d.oralCare} onChange={e => updateDraft(resident.id, 'oralCare', e.target.checked)}
                    className="w-4 h-4 accent-blue-600" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="text" value={d.specialNotes ?? ''} onChange={e => updateDraft(resident.id, 'specialNotes', e.target.value)}
                    placeholder="体重・SpO2等"
                    className="w-28 border border-gray-200 rounded px-1 py-0.5 text-xs" />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => handleSave(resident.id)}
                    disabled={saving === resident.id}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      saving === resident.id ? 'bg-gray-300 text-gray-500' :
                      isSaved && !isDirty ? 'bg-green-100 text-green-700 border border-green-300' :
                      'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saving === resident.id ? '...' : isSaved && !isDirty ? '済' : '保存'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {residents.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p>利用者が登録されていません</p>
          <a href="/residents" className="text-blue-600 underline mt-2 inline-block">利用者を登録する</a>
        </div>
      )}
    </div>
  )
}
