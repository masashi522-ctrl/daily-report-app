'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type FoodType, type Resident, type DailyRecord } from '@/types/database'
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

// 入力＋ドロップダウン一体型（モバイル用）
function ComboNum({ listId, values, current, onChange, placeholder = '-', min, max, step = 1, inputMode = 'numeric' }: {
  listId: string; values: number[]; current: number | null | undefined
  onChange: (v: number | null) => void; placeholder?: string
  min?: number; max?: number; step?: number; inputMode?: 'numeric' | 'decimal'
}) {
  return (
    <div className="flex items-stretch rounded-lg border border-gray-200 overflow-hidden focus-within:border-blue-400 transition-colors">
      <input
        type="number" list={listId} inputMode={inputMode}
        placeholder={placeholder} min={min} max={max} step={step}
        value={current ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        className="flex-1 min-w-0 px-2 py-2 text-sm text-center text-gray-900 bg-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <select
        value={current ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        className="border-l border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs px-0.5 focus:outline-none cursor-pointer shrink-0 text-gray-700"
      >
        <option value="">▼</option>
        {values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  )
}

// ±ボタン＋入力＋ドロップダウン一体型（体温用）
function ComboTemp({ listId, values, current, onChange }: {
  listId: string; values: number[]; current: number | null | undefined
  onChange: (v: number | null) => void
}) {
  const dec = () => { const c = current ?? 36.0; onChange(Math.max(35.0, Math.round((c - 0.1) * 10) / 10)) }
  const inc = () => { const c = current ?? 36.0; onChange(Math.min(42.0, Math.round((c + 0.1) * 10) / 10)) }
  return (
    <div className="flex items-stretch rounded-lg border border-gray-200 overflow-hidden focus-within:border-blue-400 transition-colors">
      <button type="button" onClick={dec}
        className="w-8 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-lg font-bold text-gray-600 shrink-0 leading-none">－</button>
      <input
        type="number" list={listId} inputMode="decimal"
        min={35} max={42} step={0.1} placeholder="36.0"
        value={current ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        className="flex-1 min-w-0 px-1 py-2 text-sm text-center text-gray-900 bg-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none border-x border-gray-200"
      />
      <select
        value={current ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        className="border-r border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs px-0.5 focus:outline-none cursor-pointer shrink-0 text-gray-700"
      >
        <option value="">▼</option>
        {values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <button type="button" onClick={inc}
        className="w-8 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-lg font-bold text-gray-600 shrink-0 leading-none">＋</button>
    </div>
  )
}

export default function DailyRecordTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState('')
  const [todayOnly, setTodayOnly] = useState(true)

  const todayNum = new Date().getDay()
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

  // デスクトップ用インプット（スピナーなし）
  const numSm = 'w-14 border border-gray-200 rounded px-1 py-0.5 text-center text-xs text-gray-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
  const selMd = 'w-full border border-gray-200 rounded-lg px-2 py-2 text-sm'
  const vRow  = 'grid grid-cols-[4.5rem_1fr_1fr] gap-x-2 items-center'
  const vLbl  = 'text-xs text-gray-500 leading-tight'
  // デスクトップ テーブルヘッダー
  const th1 = 'px-2 py-1.5 font-semibold text-center text-[11px] border-b border-gray-200'
  const th2 = 'px-2 py-1 font-medium text-center text-[10px] text-gray-500 border-b border-gray-200'
  const td  = 'px-1.5 py-1.5'

  return (
    <>
      {/* 利用者絞り込み */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
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
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="名前で絞り込む..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          {filter && (
            <button onClick={() => setFilter('')}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100">✕</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 w-full">
          {(todayOnly ? residents.filter(r => !r.attendanceDays || r.attendanceDays.split(',').map(Number).includes(todayNum)) : residents)
            .map(r => (
              <button key={r.id} onClick={() => setFilter(r.name === filter ? '' : r.name)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  filter === r.name
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}>{r.name}</button>
            ))}
        </div>
        <p className="text-xs text-gray-400 w-full text-right">{filtered.length}/{residents.length}名 表示中</p>
      </div>

      {/* datalist */}
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
              <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{resident.name}</span>
                  <span className="ml-2 text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full border border-gray-200">
                    {resident.foodType ? resident.foodType.split(',').map(t => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                  </span>
                  {resident.foodRestrictions && <div className="text-red-500 text-xs mt-0.5">{resident.foodRestrictions}</div>}
                </div>
                <SaveBtn id={resident.id} />
              </div>
              <div className="p-3 space-y-3">
                {/* バイタル 3列グリッド */}
                <div className="space-y-1.5">
                  <div className={vRow}>
                    <div />
                    <div className="text-xs font-bold text-blue-600 text-center bg-blue-50 rounded py-0.5">AM</div>
                    <div className="text-xs font-bold text-indigo-600 text-center bg-indigo-50 rounded py-0.5">PM</div>
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>収縮期<br /><span className="text-[10px] text-gray-400">mmHg</span></span>
                    <ComboNum listId="dl-bp-sys" values={BP_SYS} current={d.bpSystolic}   onChange={v => upd(resident.id, 'bpSystolic',   v)} min={70}  max={200} />
                    <ComboNum listId="dl-bp-sys" values={BP_SYS} current={d.bpSystolicPm} onChange={v => upd(resident.id, 'bpSystolicPm', v)} min={70}  max={200} />
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>拡張期<br /><span className="text-[10px] text-gray-400">mmHg</span></span>
                    <ComboNum listId="dl-bp-dia" values={BP_DIA} current={d.bpDiastolic}   onChange={v => upd(resident.id, 'bpDiastolic',   v)} min={30}  max={200} />
                    <ComboNum listId="dl-bp-dia" values={BP_DIA} current={d.bpDiastolicPm} onChange={v => upd(resident.id, 'bpDiastolicPm', v)} min={30}  max={200} />
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>脈拍<br /><span className="text-[10px] text-gray-400">回/分</span></span>
                    <ComboNum listId="dl-pulse" values={PULSE} current={d.pulse}   onChange={v => upd(resident.id, 'pulse',   v)} min={30} max={200} />
                    <ComboNum listId="dl-pulse" values={PULSE} current={d.pulsePm} onChange={v => upd(resident.id, 'pulsePm', v)} min={30} max={200} />
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>体温<br /><span className="text-[10px] text-gray-400">℃</span></span>
                    <ComboTemp listId="dl-temp" values={TEMP} current={d.tempMorning}   onChange={v => upd(resident.id, 'tempMorning',   v)} />
                    <ComboTemp listId="dl-temp" values={TEMP} current={d.tempAfternoon} onChange={v => upd(resident.id, 'tempAfternoon', v)} />
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>水分<br /><span className="text-[10px] text-gray-400">ml</span></span>
                    <ComboNum listId="dl-fluid" values={FLUID} current={d.fluidIntakeAm} onChange={v => upd(resident.id, 'fluidIntakeAm', v)} min={0} max={2000} step={50} />
                    <ComboNum listId="dl-fluid" values={FLUID} current={d.fluidIntakePm} onChange={v => upd(resident.id, 'fluidIntakePm', v)} min={0} max={2000} step={50} />
                  </div>
                </div>
                {/* 入浴・食事 */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                  <div>
                    <span className="text-xs text-gray-500 mb-0.5 block">入浴</span>
                    <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => upd(resident.id, 'bathing', e.target.value)} className={selMd}>
                      <option value="DONE">○</option>
                      <option value="NOT_DONE">×</option>
                      <option value="NOT_APPLICABLE">-</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 mb-0.5 block">主食（割）</span>
                    <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)} className={selMd}>
                      <option value="">-</option>
                      {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 mb-0.5 block">主菜（割）</span>
                    <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)} className={selMd}>
                      <option value="">-</option>
                      {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}割</option>)}
                    </select>
                  </div>
                </div>
                {/* 服薬・口腔ケア */}
                <div className="grid grid-cols-5 gap-1 pt-2 border-t border-gray-100">
                  {([
                    ['medicationMorning',     '朝薬'],
                    ['medicationBeforeLunch', '昼前'],
                    ['medicationAfterLunch',  '昼後'],
                    ['medicationEvening',     '夕薬'],
                    ['oralCare',              '口腔'],
                  ] as const).map(([field, label]) => (
                    <label key={field} className="flex flex-col items-center gap-1 cursor-pointer">
                      <span className="text-xs text-gray-500">{label}</span>
                      <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]}
                        onChange={e => upd(resident.id, field, e.target.checked)}
                        className="w-5 h-5 accent-blue-600" />
                    </label>
                  ))}
                </div>
                {/* 備考・特記 */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                    placeholder="備考"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                    placeholder="特記事項（体重・SpO2等）"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── デスクトップ：2段テーブル（横スクロールなし） ── */}
      {/*
          列構成（14列）:
          1:名前(rs=2)  2:形態(rs=2)
          3:血圧AM/入浴  4:血圧PM/食事  5:脈AM/水分AM  6:脈PM/水分PM
          7:体温AM/朝   8:体温PM/昼前  9:-/昼後  10:-/夕  11:-/口腔
          12:-/備考  13:-/特記  14:保存(rs=2)
      */}
      <div className="hidden md:block rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>{residents.length === 0 ? '利用者が登録されていません' : '該当する利用者がいません'}</p>
            {residents.length === 0 && <a href="/residents" className="text-blue-600 underline mt-2 inline-block">利用者を登録する</a>}
          </div>
        )}
        {filtered.length > 0 && (
          <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '80px' }} />  {/* 名前 */}
              <col style={{ width: '48px' }} />  {/* 形態 */}
              <col style={{ width: '100px' }} /> {/* 血圧AM / 入浴 */}
              <col style={{ width: '100px' }} /> {/* 血圧PM / 食事 */}
              <col style={{ width: '52px' }} />  {/* 脈AM / 水分AM */}
              <col style={{ width: '52px' }} />  {/* 脈PM / 水分PM */}
              <col style={{ width: '52px' }} />  {/* 体温AM / 朝薬 */}
              <col style={{ width: '52px' }} />  {/* 体温PM / 昼前 */}
              <col style={{ width: '36px' }} />  {/* - / 昼後 */}
              <col style={{ width: '36px' }} />  {/* - / 夕薬 */}
              <col style={{ width: '36px' }} />  {/* - / 口腔 */}
              <col style={{ width: '90px' }} />  {/* - / 備考 */}
              <col style={{ width: '110px' }} /> {/* - / 特記事項 */}
              <col style={{ width: '52px' }} />  {/* 保存 */}
            </colgroup>
            <thead>
              {/* ヘッダー1段目 */}
              <tr className="bg-blue-50 text-gray-700">
                <th className={`${th1} text-left sticky left-0 bg-blue-50`} rowSpan={2}>名前</th>
                <th className={th1} rowSpan={2}>形態</th>
                <th className={th1}>血圧AM<span className="text-[9px] font-normal text-gray-400 ml-0.5">収/拡</span></th>
                <th className={th1}>血圧PM<span className="text-[9px] font-normal text-gray-400 ml-0.5">収/拡</span></th>
                <th className={th1}>脈AM</th>
                <th className={th1}>脈PM</th>
                <th className={th1}>体温AM</th>
                <th className={th1}>体温PM</th>
                <th className={`${th1} bg-gray-50`} colSpan={5}></th>
                <th className={th1} rowSpan={2}>保存</th>
              </tr>
              {/* ヘッダー2段目 */}
              <tr className="bg-gray-50 text-gray-600">
                <th className={th2}>入浴</th>
                <th className={th2}>食事<span className="text-[9px] font-normal ml-0.5">主/副</span></th>
                <th className={th2}>水分AM</th>
                <th className={th2}>水分PM</th>
                <th className={th2}>朝</th>
                <th className={th2}>昼前</th>
                <th className={th2}>昼後</th>
                <th className={th2}>夕</th>
                <th className={th2}>口腔</th>
                <th className={th2}>備考</th>
                <th className={th2}>特記事項</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((resident, i) => {
                const d = getDraft(resident.id)
                const base = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                return (
                  <>
                    {/* バイタル行 */}
                    <tr key={`${resident.id}-v`} className={`${base} hover:bg-blue-50 transition border-t border-gray-200`}>
                      <td className={`${td} sticky left-0 bg-inherit font-medium text-gray-800`} rowSpan={2}>
                        <div className="font-semibold">{resident.name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {resident.foodType ? resident.foodType.split(',').map(t => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                        </div>
                        {resident.foodRestrictions && <div className="text-red-500 text-[10px]">{resident.foodRestrictions}</div>}
                      </td>
                      <td className={`${td} text-gray-500 text-[10px] text-center`} rowSpan={2}>
                        {resident.foodType ? resident.foodType.split(',').map(t => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-0.5">
                          <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200} value={d.bpSystolic ?? ''} onChange={numHandler(resident.id, 'bpSystolic')} className={numSm} />
                          <span className="text-gray-300">/</span>
                          <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200} value={d.bpDiastolic ?? ''} onChange={numHandler(resident.id, 'bpDiastolic')} className={numSm} />
                        </div>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-0.5">
                          <input type="number" list="dl-bp-sys" placeholder="収" min={70} max={200} value={d.bpSystolicPm ?? ''} onChange={numHandler(resident.id, 'bpSystolicPm')} className={numSm} />
                          <span className="text-gray-300">/</span>
                          <input type="number" list="dl-bp-dia" placeholder="拡" min={30} max={200} value={d.bpDiastolicPm ?? ''} onChange={numHandler(resident.id, 'bpDiastolicPm')} className={numSm} />
                        </div>
                      </td>
                      <td className={`${td} text-center`}><input type="number" list="dl-pulse" min={30} max={200} value={d.pulse ?? ''} onChange={numHandler(resident.id, 'pulse')} className={numSm} /></td>
                      <td className={`${td} text-center`}><input type="number" list="dl-pulse" min={30} max={200} value={d.pulsePm ?? ''} onChange={numHandler(resident.id, 'pulsePm')} className={numSm} /></td>
                      <td className={`${td} text-center`}><input type="number" list="dl-temp" step="0.1" min={35} max={42} value={d.tempMorning ?? ''} onChange={numHandler(resident.id, 'tempMorning')} className={numSm} /></td>
                      <td className={`${td} text-center`}><input type="number" list="dl-temp" step="0.1" min={35} max={42} value={d.tempAfternoon ?? ''} onChange={numHandler(resident.id, 'tempAfternoon')} className={numSm} /></td>
                      <td colSpan={5} className="bg-gray-50/50" />
                      <td className={td} rowSpan={2} style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                        <SaveBtn id={resident.id} />
                      </td>
                    </tr>
                    {/* ケア行 */}
                    <tr key={`${resident.id}-c`} className={`${base} hover:bg-blue-50 transition border-t border-gray-100`}>
                      {/* 名前・形態は rowspan=2 でスキップ */}
                      <td className={`${td} text-center`}>
                        <select value={d.bathing ?? 'NOT_APPLICABLE'} onChange={e => upd(resident.id, 'bathing', e.target.value)}
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs w-full">
                          <option value="DONE">○</option>
                          <option value="NOT_DONE">×</option>
                          <option value="NOT_APPLICABLE">-</option>
                        </select>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-0.5">
                          <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)}
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs w-[44px]">
                            <option value="">主</option>
                            {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                          <span className="text-gray-300">/</span>
                          <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)}
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs w-[44px]">
                            <option value="">副</option>
                            {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className={`${td} text-center`}><input type="number" list="dl-fluid" min={0} max={2000} step={50} value={d.fluidIntakeAm ?? ''} onChange={numHandler(resident.id, 'fluidIntakeAm')} className={numSm} /></td>
                      <td className={`${td} text-center`}><input type="number" list="dl-fluid" min={0} max={2000} step={50} value={d.fluidIntakePm ?? ''} onChange={numHandler(resident.id, 'fluidIntakePm')} className={numSm} /></td>
                      {(['medicationMorning', 'medicationBeforeLunch', 'medicationAfterLunch', 'medicationEvening'] as const).map(field => (
                        <td key={field} className={`${td} text-center`}>
                          <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]}
                            onChange={e => upd(resident.id, field, e.target.checked)}
                            className="w-4 h-4 accent-blue-600" />
                        </td>
                      ))}
                      <td className={`${td} text-center`}>
                        <input type="checkbox" checked={!!d.oralCare} onChange={e => upd(resident.id, 'oralCare', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      </td>
                      <td className={td}>
                        <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                          placeholder="備考" className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs" />
                      </td>
                      <td className={td}>
                        <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                          placeholder="体重・SpO2等" className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs" />
                      </td>
                      {/* 保存は rowspan=2 でスキップ */}
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
