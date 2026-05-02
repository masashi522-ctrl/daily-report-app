'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type Resident, type DailyRecord } from '@/types/database'
import { saveRecord } from './actions'

interface Props {
  residents: Resident[]
  recordMap: Record<string, DailyRecord>
  date: string
}

type RecordDraft = Partial<DailyRecord>

// 選択肢の範囲を生成
function range(from: number, to: number, step: number) {
  const arr: number[] = []
  for (let v = from; v <= to; v = Math.round((v + step) * 100) / 100) arr.push(v)
  return arr
}

const BP_SYS  = range(70, 200, 5)
const BP_DIA  = range(30, 200, 5)
const PULSE   = range(30, 200, 5)
const TEMP    = range(35.0, 42.0, 0.5)
const FLUID   = range(0, 1000, 50)

// 数値 input + datalist 共通スタイル
const numCls = 'w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs'

export default function DailyRecordTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function getDraft(id: string): RecordDraft {
    return drafts[id] ?? recordMap[id] ?? {}
  }

  function upd(id: string, field: string, value: unknown) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), [field]: value } }))
  }

  function num(id: string, field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      upd(id, field, e.target.value !== '' ? +e.target.value : null)
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
    <>
      {/* 共通 datalist（1回だけ定義） */}
      <datalist id="dl-bp-sys">{BP_SYS.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-bp-dia">{BP_DIA.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-pulse">{PULSE.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-temp">{TEMP.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-fluid">{FLUID.map(v => <option key={v} value={v} />)}</datalist>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-blue-50 text-gray-700">
              <th className="sticky left-0 bg-blue-50 px-3 py-2 text-left font-semibold min-w-[100px]">名前</th>
              <th className="px-2 py-2 font-semibold min-w-[60px]">形態</th>
              <th className="px-2 py-2 font-semibold min-w-[110px]">血圧AM<span className="text-[10px] font-normal text-gray-400 ml-0.5">収/拡</span></th>
              <th className="px-2 py-2 font-semibold min-w-[110px]">血圧PM<span className="text-[10px] font-normal text-gray-400 ml-0.5">収/拡</span></th>
              <th className="px-2 py-2 font-semibold min-w-[55px]">脈拍AM</th>
              <th className="px-2 py-2 font-semibold min-w-[55px]">脈拍PM</th>
              <th className="px-2 py-2 font-semibold min-w-[60px]">体温AM</th>
              <th className="px-2 py-2 font-semibold min-w-[60px]">体温PM</th>
              <th className="px-2 py-2 font-semibold min-w-[50px]">入浴</th>
              <th className="px-2 py-2 font-semibold min-w-[110px]">食事量<span className="text-[10px] font-normal text-gray-400 ml-0.5">主食/主菜</span></th>
              <th className="px-2 py-2 font-semibold min-w-[60px]">水分AM</th>
              <th className="px-2 py-2 font-semibold min-w-[60px]">水分PM</th>
              <th className="px-2 py-2 font-semibold min-w-[40px]">朝薬</th>
              <th className="px-2 py-2 font-semibold min-w-[40px]">昼前</th>
              <th className="px-2 py-2 font-semibold min-w-[40px]">昼後</th>
              <th className="px-2 py-2 font-semibold min-w-[40px]">夕薬</th>
              <th className="px-2 py-2 font-semibold min-w-[40px]">口腔</th>
              <th className="px-2 py-2 font-semibold min-w-[100px]">備考</th>
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

                  {/* 名前 */}
                  <td className="sticky left-0 bg-inherit px-3 py-1.5 font-medium text-gray-800">
                    {resident.name}
                    {resident.foodRestrictions && (
                      <div className="text-red-500 text-[10px]">{resident.foodRestrictions}</div>
                    )}
                  </td>

                  {/* 形態 */}
                  <td className="px-2 py-1.5 text-gray-600 text-center">{FOOD_TYPE_LABELS[resident.foodType]}</td>

                  {/* 血圧AM 収/拡 */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200}
                        value={d.bpSystolic ?? ''} onChange={num(resident.id, 'bpSystolic')} className={numCls} />
                      <span className="text-gray-400">/</span>
                      <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200}
                        value={d.bpDiastolic ?? ''} onChange={num(resident.id, 'bpDiastolic')} className={numCls} />
                    </div>
                  </td>

                  {/* 血圧PM 収/拡 */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200}
                        value={d.bpSystolicPm ?? ''} onChange={num(resident.id, 'bpSystolicPm')} className={numCls} />
                      <span className="text-gray-400">/</span>
                      <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200}
                        value={d.bpDiastolicPm ?? ''} onChange={num(resident.id, 'bpDiastolicPm')} className={numCls} />
                    </div>
                  </td>

                  {/* 脈拍AM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-pulse" min={30} max={200}
                      value={d.pulse ?? ''} onChange={num(resident.id, 'pulse')} className={numCls} />
                  </td>

                  {/* 脈拍PM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-pulse" min={30} max={200}
                      value={d.pulsePm ?? ''} onChange={num(resident.id, 'pulsePm')} className={numCls} />
                  </td>

                  {/* 体温AM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-temp" step="0.1" min={35} max={42}
                      value={d.tempMorning ?? ''} onChange={num(resident.id, 'tempMorning')} className={numCls} />
                  </td>

                  {/* 体温PM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-temp" step="0.1" min={35} max={42}
                      value={d.tempAfternoon ?? ''} onChange={num(resident.id, 'tempAfternoon')} className={numCls} />
                  </td>

                  {/* 入浴 */}
                  <td className="px-2 py-1.5">
                    <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => upd(resident.id, 'bathing', e.target.value)}
                      className="border border-gray-200 rounded px-1 py-0.5 text-xs w-16">
                      <option value="DONE">○</option>
                      <option value="NOT_DONE">×</option>
                      <option value="NOT_APPLICABLE">-</option>
                    </select>
                  </td>

                  {/* 食事量 主食/主菜 */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)}
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                        <option value="">主食</option>
                        {[0,1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}割</option>)}
                      </select>
                      <span className="text-gray-400">/</span>
                      <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)}
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                        <option value="">主菜</option>
                        {[0,1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}割</option>)}
                      </select>
                    </div>
                  </td>

                  {/* 水分AM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-fluid" min={0} max={2000} step={50}
                      value={d.fluidIntakeAm ?? ''} onChange={num(resident.id, 'fluidIntakeAm')} className={numCls} />
                  </td>

                  {/* 水分PM */}
                  <td className="px-2 py-1.5">
                    <input type="number" list="dl-fluid" min={0} max={2000} step={50}
                      value={d.fluidIntakePm ?? ''} onChange={num(resident.id, 'fluidIntakePm')} className={numCls} />
                  </td>

                  {/* 薬チェック */}
                  {(['medicationMorning', 'medicationBeforeLunch', 'medicationAfterLunch', 'medicationEvening'] as const).map(field => (
                    <td key={field} className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]}
                        onChange={e => upd(resident.id, field, e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                    </td>
                  ))}

                  {/* 口腔ケア */}
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!d.oralCare}
                      onChange={e => upd(resident.id, 'oralCare', e.target.checked)}
                      className="w-4 h-4 accent-blue-600" />
                  </td>

                  {/* 口腔備考 */}
                  <td className="px-2 py-1.5">
                    <input type="text" value={d.oralCareNote ?? ''}
                      onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                      placeholder="備考"
                      className="w-24 border border-gray-200 rounded px-1 py-0.5 text-xs" />
                  </td>

                  {/* 特記事項 */}
                  <td className="px-2 py-1.5">
                    <input type="text" value={d.specialNotes ?? ''}
                      onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                      placeholder="体重・SpO2等"
                      className="w-28 border border-gray-200 rounded px-1 py-0.5 text-xs" />
                  </td>

                  {/* 保存 */}
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => handleSave(resident.id)} disabled={saving === resident.id}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        saving === resident.id ? 'bg-gray-300 text-gray-500' :
                        isSaved && !isDirty ? 'bg-green-100 text-green-700 border border-green-300' :
                        'bg-blue-600 text-white hover:bg-blue-700'
                      }`}>
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
    </>
  )
}
