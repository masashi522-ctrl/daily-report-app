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

function range(from: number, to: number, step: number) {
  const arr: number[] = []
  for (let v = from; v <= to; v = Math.round((v + step) * 100) / 100) arr.push(v)
  return arr
}

const BP_SYS = range(70, 200, 5)
const BP_DIA = range(30, 200, 5)
const PULSE  = range(30, 200, 5)
const TEMP   = range(35.0, 42.0, 0.5)
const FLUID  = range(0, 1000, 50)

const MEAL_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10]

export default function DailyRecordTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState('')
  const [todayOnly, setTodayOnly] = useState(true)

  const todayNum = new Date().getDay() // 0=日,1=月,...,6=土
  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  const filtered = residents.filter(r => {
    const matchDay = !todayOnly || !r.attendanceDays ||
      r.attendanceDays.split(',').map(Number).includes(todayNum)
    const matchName = !filter || r.name.includes(filter)
    return matchDay && matchName
  })

  function getDraft(id: string): RecordDraft {
    return drafts[id] ?? recordMap[id] ?? {}
  }

  function upd(id: string, field: string, value: unknown) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), [field]: value } }))
  }

  function numHandler(id: string, field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      upd(id, field, e.target.value !== '' ? +e.target.value : null)
  }

  function selNum(id: string, field: string) {
    return (e: React.ChangeEvent<HTMLSelectElement>) =>
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

  function SaveBtn({ id }: { id: string }) {
    const isSaved = !!recordMap[id]
    const isDirty = !!drafts[id]
    return (
      <button onClick={() => handleSave(id)} disabled={saving === id}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
          saving === id        ? 'bg-gray-200 text-gray-400' :
          isSaved && !isDirty ? 'bg-green-100 text-green-700 border border-green-300' :
                                'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
        {saving === id ? '保存中...' : isSaved && !isDirty ? '済' : '保存'}
      </button>
    )
  }

  const numSm  = 'w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs'
  const numMd  = 'w-full border border-gray-200 rounded-lg px-2 py-2 text-center text-sm'
  const selMd  = 'w-full border border-gray-200 rounded-lg px-2 py-2 text-sm'
  const lblSm  = 'text-xs text-gray-500 mb-0.5 block'

  return (
    <>
      {/* 利用者絞り込み */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
        {/* 今日のみ／全員 トグル */}
        <div className="flex gap-1 w-full">
          <button onClick={() => setTodayOnly(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
              todayOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
            }`}>
            {DAY_LABELS[todayNum]}曜日の利用者
          </button>
          <button onClick={() => setTodayOnly(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
              !todayOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
            }`}>
            全利用者
          </button>
        </div>

        {/* 名前検索 */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="名前で絞り込む..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          {filter && (
            <button onClick={() => setFilter('')}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100">
              ✕
            </button>
          )}
        </div>

        {/* 名前ボタン（フィルター後の利用者） */}
        <div className="flex flex-wrap gap-1 w-full">
          {(todayOnly ? residents.filter(r => !r.attendanceDays || r.attendanceDays.split(',').map(Number).includes(todayNum)) : residents)
            .map(r => (
              <button key={r.id} onClick={() => setFilter(r.name === filter ? '' : r.name)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  filter === r.name
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}>
                {r.name}
              </button>
            ))}
        </div>

        <p className="text-xs text-gray-400 w-full text-right">
          {filtered.length}/{residents.length}名 表示中
        </p>
      </div>

      {/* 共通 datalist */}
      <datalist id="dl-bp-sys">{BP_SYS.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-bp-dia">{BP_DIA.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-pulse">{PULSE.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-temp">{TEMP.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-fluid">{FLUID.map(v => <option key={v} value={v} />)}</datalist>

      {/* ── モバイル：カード表示 ── */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>利用者が登録されていません</p>
            <a href="/residents" className="text-blue-600 underline mt-2 inline-block">利用者を登録する</a>
          </div>
        )}
        {filtered.map(resident => {
          const d = getDraft(resident.id)
          return (
            <div key={resident.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

              {/* カードヘッダー */}
              <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{resident.name}</span>
                  <span className="ml-2 text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full border border-gray-200">
                    {FOOD_TYPE_LABELS[resident.foodType]}
                  </span>
                  {resident.foodRestrictions && (
                    <div className="text-red-500 text-xs mt-0.5">{resident.foodRestrictions}</div>
                  )}
                </div>
                <SaveBtn id={resident.id} />
              </div>

              <div className="p-3 space-y-3">

                {/* バイタル AM/PM グリッド */}
                <div className="grid grid-cols-2 gap-2">
                  {/* AM */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-blue-600 text-center bg-blue-50 rounded py-0.5">AM</p>
                    <div>
                      <span className={lblSm}>血圧 収縮期</span>
                      <select value={d.bpSystolic ?? ''} onChange={selNum(resident.id, 'bpSystolic')} className={selMd}>
                        <option value="">-</option>
                        {BP_SYS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>血圧 拡張期</span>
                      <select value={d.bpDiastolic ?? ''} onChange={selNum(resident.id, 'bpDiastolic')} className={selMd}>
                        <option value="">-</option>
                        {BP_DIA.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>脈拍</span>
                      <select value={d.pulse ?? ''} onChange={selNum(resident.id, 'pulse')} className={selMd}>
                        <option value="">-</option>
                        {PULSE.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>体温</span>
                      <select value={d.tempMorning ?? ''} onChange={selNum(resident.id, 'tempMorning')} className={selMd}>
                        <option value="">-</option>
                        {TEMP.map(v => <option key={v} value={v}>{v.toFixed(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>水分(ml)</span>
                      <select value={d.fluidIntakeAm ?? ''} onChange={selNum(resident.id, 'fluidIntakeAm')} className={selMd}>
                        <option value="">-</option>
                        {FLUID.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* PM */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-indigo-600 text-center bg-indigo-50 rounded py-0.5">PM</p>
                    <div>
                      <span className={lblSm}>血圧 収縮期</span>
                      <select value={d.bpSystolicPm ?? ''} onChange={selNum(resident.id, 'bpSystolicPm')} className={selMd}>
                        <option value="">-</option>
                        {BP_SYS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>血圧 拡張期</span>
                      <select value={d.bpDiastolicPm ?? ''} onChange={selNum(resident.id, 'bpDiastolicPm')} className={selMd}>
                        <option value="">-</option>
                        {BP_DIA.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>脈拍</span>
                      <select value={d.pulsePm ?? ''} onChange={selNum(resident.id, 'pulsePm')} className={selMd}>
                        <option value="">-</option>
                        {PULSE.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>体温</span>
                      <select value={d.tempAfternoon ?? ''} onChange={selNum(resident.id, 'tempAfternoon')} className={selMd}>
                        <option value="">-</option>
                        {TEMP.map(v => <option key={v} value={v}>{v.toFixed(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={lblSm}>水分(ml)</span>
                      <select value={d.fluidIntakePm ?? ''} onChange={selNum(resident.id, 'fluidIntakePm')} className={selMd}>
                        <option value="">-</option>
                        {FLUID.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 入浴・食事 */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                  <div>
                    <span className={lblSm}>入浴</span>
                    <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => upd(resident.id, 'bathing', e.target.value)} className={selMd}>
                      <option value="DONE">○</option>
                      <option value="NOT_DONE">×</option>
                      <option value="NOT_APPLICABLE">-</option>
                    </select>
                  </div>
                  <div>
                    <span className={lblSm}>主食（割）</span>
                    <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)} className={selMd}>
                      <option value="">-</option>
                      {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                  </div>
                  <div>
                    <span className={lblSm}>主菜（割）</span>
                    <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)} className={selMd}>
                      <option value="">-</option>
                      {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                  </div>
                </div>

                {/* 服薬 */}
                <div className="grid grid-cols-4 gap-1 pt-1 border-t border-gray-100">
                  {([
                    ['medicationMorning', '朝薬'],
                    ['medicationBeforeLunch', '昼前'],
                    ['medicationAfterLunch', '昼後'],
                    ['medicationEvening', '夕薬'],
                  ] as const).map(([field, label]) => (
                    <label key={field} className="flex flex-col items-center gap-1 cursor-pointer">
                      <span className="text-xs text-gray-500">{label}</span>
                      <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]}
                        onChange={e => upd(resident.id, field, e.target.checked)}
                        className="w-5 h-5 accent-blue-600" />
                    </label>
                  ))}
                </div>

                {/* 口腔・備考・特記 */}
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!d.oralCare}
                        onChange={e => upd(resident.id, 'oralCare', e.target.checked)}
                        className="w-5 h-5 accent-blue-600" />
                      <span className="text-sm text-gray-700">口腔ケア</span>
                    </label>
                    <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                      placeholder="備考"
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                    placeholder="特記事項（体重・SpO2等）"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                </div>

              </div>
            </div>
          )
        })}
      </div>

      {/* ── デスクトップ：テーブル表示 ── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
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
            {filtered.map((resident, i) => {
              const d = getDraft(resident.id)
              return (
                <tr key={resident.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition`}>
                  <td className="sticky left-0 bg-inherit px-3 py-1.5 font-medium text-gray-800">
                    {resident.name}
                    {resident.foodRestrictions && <div className="text-red-500 text-[10px]">{resident.foodRestrictions}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 text-center">{FOOD_TYPE_LABELS[resident.foodType]}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200} value={d.bpSystolic ?? ''} onChange={numHandler(resident.id, 'bpSystolic')} className={numSm} />
                      <span className="text-gray-400">/</span>
                      <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200} value={d.bpDiastolic ?? ''} onChange={numHandler(resident.id, 'bpDiastolic')} className={numSm} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200} value={d.bpSystolicPm ?? ''} onChange={numHandler(resident.id, 'bpSystolicPm')} className={numSm} />
                      <span className="text-gray-400">/</span>
                      <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200} value={d.bpDiastolicPm ?? ''} onChange={numHandler(resident.id, 'bpDiastolicPm')} className={numSm} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-pulse" min={30} max={200} value={d.pulse ?? ''} onChange={numHandler(resident.id, 'pulse')} className={numSm} /></td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-pulse" min={30} max={200} value={d.pulsePm ?? ''} onChange={numHandler(resident.id, 'pulsePm')} className={numSm} /></td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-temp" step="0.1" min={35} max={42} value={d.tempMorning ?? ''} onChange={numHandler(resident.id, 'tempMorning')} className={numSm} /></td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-temp" step="0.1" min={35} max={42} value={d.tempAfternoon ?? ''} onChange={numHandler(resident.id, 'tempAfternoon')} className={numSm} /></td>
                  <td className="px-2 py-1.5">
                    <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => upd(resident.id, 'bathing', e.target.value)} className="border border-gray-200 rounded px-1 py-0.5 text-xs w-16">
                      <option value="DONE">○</option>
                      <option value="NOT_DONE">×</option>
                      <option value="NOT_APPLICABLE">-</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)} className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                        <option value="">主食</option>
                        {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                      </select>
                      <span className="text-gray-400">/</span>
                      <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)} className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                        <option value="">主菜</option>
                        {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-fluid" min={0} max={2000} step={50} value={d.fluidIntakeAm ?? ''} onChange={numHandler(resident.id, 'fluidIntakeAm')} className={numSm} /></td>
                  <td className="px-2 py-1.5"><input type="number" list="dl-fluid" min={0} max={2000} step={50} value={d.fluidIntakePm ?? ''} onChange={numHandler(resident.id, 'fluidIntakePm')} className={numSm} /></td>
                  {(['medicationMorning', 'medicationBeforeLunch', 'medicationAfterLunch', 'medicationEvening'] as const).map(field => (
                    <td key={field} className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]} onChange={e => upd(resident.id, field, e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!d.oralCare} onChange={e => upd(resident.id, 'oralCare', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)} placeholder="備考" className="w-24 border border-gray-200 rounded px-1 py-0.5 text-xs" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)} placeholder="体重・SpO2等" className="w-28 border border-gray-200 rounded px-1 py-0.5 text-xs" />
                  </td>
                  <td className="px-2 py-1.5 text-center"><SaveBtn id={resident.id} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>{residents.length === 0 ? '利用者が登録されていません' : '該当する利用者がいません'}</p>
            {residents.length === 0 && <a href="/residents" className="text-blue-600 underline mt-2 inline-block">利用者を登録する</a>}
          </div>
        )}
      </div>
    </>
  )
}
