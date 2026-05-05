'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type FoodType, type Resident, type DailyRecord } from '@/types/database'
import { saveRecord, saveAllRecords } from './actions'

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
const TEMP   = range(35.0, 42.0, 0.1)
const FLUID  = range(0, 1000, 50)
const FLUID_SELECT = range(50, 1000, 50)
const MEAL_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10]

// iOS Safari では class の color が WebkitTextFillColor に負けるためinline styleで確実に指定
const inputStyle: React.CSSProperties = {
  color: '#111827',
  backgroundColor: '#ffffff',
  WebkitTextFillColor: '#111827',
}

// モバイル用: 入力＋ドロップダウン一体型
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
        className="flex-1 min-w-0 px-2 py-2 text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ ...inputStyle, fontSize: '16px' }}
      />
      <select
        value={current ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        className="border-l border-gray-200 bg-gray-50 hover:bg-gray-100 focus:outline-none cursor-pointer shrink-0 text-gray-700"
        style={{ fontSize: '16px', width: '44px' }}
      >
        <option value="">▼</option>
        {values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  )
}

const GOJUUON_ROWS = [
  { label: 'あ', chars: 'あいうえおアイウエオ' },
  { label: 'か', chars: 'かきくけこカキクケコがぎぐげごガギグゲゴ' },
  { label: 'さ', chars: 'さしすせそサシスセソざじずぜぞザジズゼゾ' },
  { label: 'た', chars: 'たちつてとタチツテトだぢづでどダヂヅデド' },
  { label: 'な', chars: 'なにぬねのナニヌネノ' },
  { label: 'は', chars: 'はひふへほハヒフヘホばびぶべぼバビブベボぱぴぷぺぽパピプペポ' },
  { label: 'ま', chars: 'まみむめもマミムメモ' },
  { label: 'や', chars: 'やゆよヤユヨ' },
  { label: 'ら', chars: 'らりるれろラリルレロ' },
  { label: 'わ', chars: 'わをんワヲン' },
]

export default function DailyRecordTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [todayOnly, setTodayOnly] = useState(true)
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [incompleteOnly, setIncompleteOnly] = useState(false)

  const todayNum = new Date().getDay()
  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  // 必須項目（備考・特記事項を除く）の未入力チェック
  const REQUIRED: { key: keyof RecordDraft; label: string }[] = [
    { key: 'bpSystolic',    label: '血圧収縮AM' },
    { key: 'bpSystolicPm',  label: '血圧収縮PM' },
    { key: 'bpDiastolic',   label: '血圧拡張AM' },
    { key: 'bpDiastolicPm', label: '血圧拡張PM' },
    { key: 'pulse',         label: '脈拍AM' },
    { key: 'pulsePm',       label: '脈拍PM' },
    { key: 'tempMorning',   label: '体温AM' },
    { key: 'tempAfternoon', label: '体温PM' },
    { key: 'mealMainFood',  label: '主食' },
    { key: 'mealSideFood',  label: '主菜' },
    { key: 'fluidIntakeAm', label: '水分AM' },
    { key: 'fluidIntakePm', label: '水分PM' },
  ]
  function getMissing(id: string): string[] {
    const d = getDraft(id)
    const hasRecord = !!recordMap[id]
    if (!hasRecord) return ['未記録']
    return REQUIRED.filter(f => (d as Record<string, unknown>)[f.key] == null).map(f => f.label)
  }

  function matchRow(r: Resident) {
    if (!gojuuonRow) return true
    const searchChar = (r.furigana ?? r.name)[0]
    const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
    return row ? row.chars.includes(searchChar) : true
  }

  // 今日の曜日登録者（曜日フィルタのみ）
  const scheduledToday = residents.filter(r =>
    !todayOnly || !r.attendanceDays ||
    r.attendanceDays.split(',').map(Number).includes(todayNum)
  )

  // テーブル/カード用フィルタ（名前・50音・複数選択・未入力フィルタ込み）
  const filtered = scheduledToday.filter(r => {
    if (!matchRow(r)) return false
    if (selectedIds.size > 0) {
      if (!selectedIds.has(r.id)) return false
    } else if (searchText) {
      if (!r.name.includes(searchText) && !(r.furigana ?? '').includes(searchText)) return false
    }
    if (incompleteOnly) {
      const d = getDraft(r.id)
      const absent = d.isAbsent ?? recordMap[r.id]?.isAbsent ?? false
      return !absent && getMissing(r.id).length > 0
    }
    return true
  })

  // カウント（曜日登録者ベース）
  const absentCount = scheduledToday.filter(r =>
    getDraft(r.id).isAbsent ?? recordMap[r.id]?.isAbsent ?? false
  ).length
  const attendingCount = scheduledToday.length - absentCount
  const incompleteCount = scheduledToday.filter(r => {
    const absent = getDraft(r.id).isAbsent ?? recordMap[r.id]?.isAbsent ?? false
    return !absent && getMissing(r.id).length > 0
  }).length

  // 名前ボタン用：曜日+50音+テキストで絞り込む
  const nameButtonList = scheduledToday.filter(r =>
    matchRow(r) &&
    (!searchText || r.name.includes(searchText) || (r.furigana ?? '').includes(searchText))
  )

  function toggleResident(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSearch() {
    const firstId = Array.from(selectedIds)[0]
    if (firstId) {
      document.getElementById(`resident-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function clearAll() {
    setSelectedIds(new Set())
    setSearchText('')
  }

  function getDraft(id: string): RecordDraft {
    return drafts[id] ?? recordMap[id] ?? { isAbsent: false }
  }

  function upd(id: string, field: string, value: unknown) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), [field]: value } }))
  }

  function updMany(id: string, fields: Partial<RecordDraft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), ...fields } }))
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
      setDrafts(prev => { const next = { ...prev }; delete next[residentId]; return next })
      setSavedIds(prev => new Set(prev).add(residentId))
    })
  }

  async function handleSaveAll() {
    if (savingAll) return
    setSavingAll(true)
    const toSave = filtered.map(resident => {
      const draft = getDraft(resident.id)
      const existing = recordMap[resident.id]
      return { ...draft, residentId: resident.id, date, id: existing?.id }
    })
    startTransition(async () => {
      await saveAllRecords(toSave)
      setDrafts({})
      setSavedIds(prev => new Set([...prev, ...filtered.map(r => r.id)]))
      setSavingAll(false)
    })
  }

  function SaveBtn({ id }: { id: string }) {
    const isSaved = !!recordMap[id] || savedIds.has(id)
    const isDirty = !!drafts[id]
    return (
      <button onClick={() => handleSave(id)} disabled={saving === id || savingAll}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
          saving === id        ? 'bg-gray-200 text-gray-400' :
          isSaved && !isDirty ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                                'bg-violet-600 text-white hover:bg-violet-700'
        }`}>
        {saving === id ? '保存中...' : isSaved && !isDirty ? '済' : '保存'}
      </button>
    )
  }

  // デスクトップ用: 数値入力（スピナーなし、色をinline styleで保証）
  const numBase = 'border border-gray-200 rounded px-1 py-0.5 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
  const selMd = 'w-full border border-gray-200 rounded-lg px-2 py-2 text-sm'
  const selSm = 'border border-gray-200 rounded px-0.5 py-0.5 text-xs text-gray-700 w-full'
  const vRow  = 'grid grid-cols-[4.5rem_1fr_1fr] gap-x-2 items-center'
  const vLbl  = 'text-xs text-gray-500 leading-tight'
  // テーブルヘッダー：カテゴリ別カラー
  const thBase   = 'px-1 py-1.5 font-semibold text-center text-[11px] border-b whitespace-nowrap'
  const thName   = `${thBase} bg-slate-100   text-slate-700  border-slate-200`
  const thVital  = `${thBase} bg-rose-50     text-rose-700   border-rose-100`
const thMeal   = `${thBase} bg-amber-50    text-amber-700  border-amber-100`
  const thFluid  = `${thBase} bg-sky-50      text-sky-700    border-sky-100`
  const thMed    = `${thBase} bg-violet-50   text-violet-700 border-violet-100`
  const thNote   = `${thBase} bg-gray-50     text-gray-600   border-gray-200`
  const thSave   = `${thBase} bg-emerald-50  text-emerald-700 border-emerald-100`
  const td = 'px-1.5 py-1.5 align-middle'

  return (
    <>
      {/* 利用者絞り込み */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
        {/* 曜日フィルタ＋カウント */}
        <div className="flex gap-1 w-full">
          <button onClick={() => setTodayOnly(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
              todayOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400'
            }`}>
            {DAY_LABELS[todayNum]}曜日の利用者
          </button>
          <button onClick={() => setTodayOnly(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
              !todayOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400'
            }`}>
            全利用者
          </button>
        </div>
        {/* 登録者数・実利用者・欠席・未入力 カウントバー */}
        <div className="flex flex-wrap gap-2 w-full text-xs">
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full font-medium">
            登録 {scheduledToday.length}名
          </span>
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
            実利用 {attendingCount}名
          </span>
          {absentCount > 0 && (
            <span className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded-full font-medium">
              欠席 {absentCount}名
            </span>
          )}
          {incompleteCount > 0 && (
            <button onClick={() => setIncompleteOnly(v => !v)}
              className={`px-2.5 py-1 rounded-full font-medium transition ${
                incompleteOnly
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}>
              ⚠ 未入力 {incompleteCount}名{incompleteOnly ? ' ✕' : ''}
            </button>
          )}
        </div>
        {/* テキスト検索（名前ボタン絞り込み用） */}
        <div className="flex items-center gap-2 w-full">
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="名前で絞り込む..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            style={{ fontSize: '16px' }}
          />
          {(searchText || selectedIds.size > 0) && (
            <button onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 whitespace-nowrap">✕ クリア</button>
          )}
          {selectedIds.size > 0 && (
            <span className="text-xs text-violet-600 font-medium whitespace-nowrap">{selectedIds.size}名選択中</span>
          )}
        </div>
        {/* 50音タブ */}
        <div className="flex flex-wrap gap-1 w-full">
          <span className="text-xs text-gray-400 self-center mr-1">50音:</span>
          <button
            onClick={() => setGojuuonRow(null)}
            className={`text-xs px-2 py-1 rounded border transition font-medium ${
              gojuuonRow === null
                ? 'bg-violet-700 text-white border-violet-700'
                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400'
            }`}
          >全</button>
          {GOJUUON_ROWS.map(row => (
            <button key={row.label}
              onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
              className={`text-xs px-2 py-1 rounded border transition ${
                gojuuonRow === row.label
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600'
              }`}
            >{row.label}</button>
          ))}
        </div>
        {/* 名前ボタン（複数選択可・クリックで入力欄へジャンプ） */}
        {nameButtonList.length > 0 ? (
          <div className="flex flex-wrap gap-1 w-full">
            {nameButtonList.map(r => {
              const absent = getDraft(r.id).isAbsent ?? recordMap[r.id]?.isAbsent ?? false
              const incomplete = !absent && getMissing(r.id).length > 0
              const selected = selectedIds.has(r.id)
              return (
                <button key={r.id} onClick={() => toggleResident(r.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                    selected
                      ? 'bg-violet-600 text-white border-violet-600'
                      : absent
                      ? 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'
                  }`}>
                  {absent && <span className="text-[9px]">欠</span>}
                  {incomplete && !absent && <span className={selected ? 'text-amber-200' : 'text-amber-500'}>⚠</span>}
                  {r.name}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 w-full">{gojuuonRow ? `${gojuuonRow}行の利用者はいません` : ''}</p>
        )}
        {selectedIds.size > 0 && (
          <button
            onClick={handleSearch}
            className="w-full py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 font-medium transition"
          >
            検索（{selectedIds.size}名選択中）→ 入力欄へ
          </button>
        )}
        <div className="flex gap-2 w-full justify-end items-center">
          <button
            onClick={() => window.open(`/print?date=${date}`, '_blank')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800 transition flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            印刷
          </button>
          <button
            onClick={handleSaveAll}
            disabled={savingAll || saving !== null}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
              savingAll || saving !== null
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {savingAll ? '保存中...' : `全員保存（${filtered.length}名）`}
          </button>
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
          const isAbsent = d.isAbsent ?? false
          const missing = getMissing(resident.id)
          const hasVital = d.bpSystolic != null || d.tempMorning != null
          return (
            <div key={resident.id} id={`resident-${resident.id}`} className={`rounded-xl border shadow-sm overflow-hidden ${isAbsent ? 'border-gray-300 opacity-70' : 'border-gray-200 bg-white'}`}>
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: isAbsent ? '#f1f5f9' : 'linear-gradient(135deg, #ccfbf1 0%, #cffafe 100%)' }}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold ${isAbsent ? 'text-gray-400 line-through' : 'text-teal-900'}`}>{resident.name}</span>
                    {isAbsent ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500">欠席</span>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        hasVital ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>{hasVital ? 'バイタル済' : '未測定'}</span>
                    )}
                    {!isAbsent && missing.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                        ⚠ {missing.length}項目未入力
                      </span>
                    )}
                  </div>
                  {!isAbsent && (
                    <span className="text-xs text-teal-600 bg-white/70 px-1.5 py-0.5 rounded-full border border-teal-200 mt-1 inline-block">
                      {resident.foodType ? resident.foodType.split(',').map(t => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                    </span>
                  )}
                  {resident.foodRestrictions && !isAbsent && <div className="text-red-500 text-xs mt-0.5">{resident.foodRestrictions}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updMany(resident.id, { isAbsent: !isAbsent, absenceReason: isAbsent ? null : d.absenceReason })}
                    className={`text-xs px-2 py-1 rounded-lg border font-medium transition ${
                      isAbsent ? 'bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                    {isAbsent ? '欠席中' : '欠席'}
                  </button>
                  <SaveBtn id={resident.id} />
                </div>
              </div>
              {isAbsent ? (
                <div className="p-3 space-y-2">
                  <p className="text-xs text-gray-400 text-center py-2">欠席中のため記録不要</p>
                  <div>
                    <span className="text-xs text-gray-500 mb-0.5 block">欠席理由（任意）</span>
                    <input type="text" value={d.absenceReason ?? ''} onChange={e => upd(resident.id, 'absenceReason', e.target.value || null)}
                      placeholder="例：発熱、家族の都合 等"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" style={{ fontSize: '16px' }} />
                  </div>
                </div>
              ) : (
              <div className="p-3 space-y-3">
                {/* バイタル 3列グリッド */}
                <div className="space-y-1.5">
                  <div className={vRow}>
                    <div className="text-xs font-bold text-rose-600">バイタル</div>
                    <div className="text-xs font-bold text-rose-600 text-center bg-rose-50 rounded py-0.5">AM</div>
                    <div className="text-xs font-bold text-rose-500 text-center bg-rose-50/60 rounded py-0.5">PM</div>
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
                    <ComboNum listId="dl-temp" values={TEMP} current={d.tempMorning}   onChange={v => upd(resident.id, 'tempMorning',   v)} min={35} max={42} step={0.1} inputMode="decimal" placeholder="-" />
                    <ComboNum listId="dl-temp" values={TEMP} current={d.tempAfternoon} onChange={v => upd(resident.id, 'tempAfternoon', v)} min={35} max={42} step={0.1} inputMode="decimal" placeholder="-" />
                  </div>
                  <div className={vRow}>
                    <span className={vLbl}>水分<br /><span className="text-[10px] text-gray-400">ml</span></span>
                    <ComboNum listId="dl-fluid" values={FLUID} current={d.fluidIntakeAm} onChange={v => upd(resident.id, 'fluidIntakeAm', v)} min={0} max={2000} step={50} />
                    <ComboNum listId="dl-fluid" values={FLUID} current={d.fluidIntakePm} onChange={v => upd(resident.id, 'fluidIntakePm', v)} min={0} max={2000} step={50} />
                  </div>
                </div>
                {/* 食事 */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-100">
                  <div className="col-span-2 text-[10px] font-bold text-amber-600 -mb-1">食事</div>
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
                <div className="grid grid-cols-6 gap-1 pt-2 border-t border-violet-100">
                  <div className="col-span-6 text-[10px] font-bold text-violet-600 -mb-1">服薬・口腔ケア</div>
                  {([
                    ['medicationMorning',      '朝'],
                    ['medicationBeforeLunch',  '昼前'],
                    ['medicationAfterLunch',   '昼後'],
                    ['medicationBeforeEvening','夕前'],
                    ['medicationEvening',      '夕後'],
                    ['oralCare',               '口腔'],
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
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <div className="text-[10px] font-bold text-gray-500">備考・特記</div>
                  <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                    placeholder="備考"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                    placeholder="特記事項（体重・SpO2等）"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── デスクトップ：1行テーブル（横スクロールあり・幅広め） ── */}
      <div className="hidden md:block rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>{residents.length === 0 ? '利用者が登録されていません' : '該当する利用者がいません'}</p>
            {residents.length === 0 && <a href="/residents" className="text-blue-600 underline mt-2 inline-block">利用者を登録する</a>}
          </div>
        )}
        {filtered.length > 0 && (
          <table className="text-xs" style={{ tableLayout: 'fixed', minWidth: '1150px', width: '100%' }}>
            <colgroup>
              <col style={{ width: '90px' }} />   {/* 名前 */}
              <col style={{ width: '148px' }} />  {/* 血圧AM */}
              <col style={{ width: '148px' }} />  {/* 血圧PM */}
              <col style={{ width: '112px' }} />  {/* 脈拍 AM+PM */}
              <col style={{ width: '112px' }} />  {/* 体温 AM+PM */}
              <col style={{ width: '92px' }} />   {/* 食事 */}
              <col style={{ width: '100px' }} />  {/* 水分 AM+PM */}
              <col style={{ width: '120px' }} />  {/* 服薬・口腔 */}
              <col style={{ width: '86px' }} />   {/* 備考 */}
              <col style={{ width: '90px' }} />   {/* 特記 */}
              <col style={{ width: '58px' }} />   {/* 保存 */}
            </colgroup>
            <thead>
              <tr>
                <th className={thName}>名前</th>
                <th className={thVital}>
                  <div>血圧 AM</div>
                  <div className="text-[9px] font-normal opacity-70">収縮 / 拡張</div>
                </th>
                <th className={thVital}>
                  <div>血圧 PM</div>
                  <div className="text-[9px] font-normal opacity-70">収縮 / 拡張</div>
                </th>
                <th className={thVital}>
                  <div>脈拍</div>
                  <div className="flex justify-around text-[9px] font-normal opacity-70"><span>AM</span><span>PM</span></div>
                </th>
                <th className={thVital}>
                  <div>体温 ℃</div>
                  <div className="flex justify-around text-[9px] font-normal opacity-70"><span>AM</span><span>PM</span></div>
                </th>
                <th className={thMeal}>
                  <div>食事</div>
                  <div className="flex justify-around text-[9px] font-normal opacity-70"><span>主</span><span>副</span></div>
                </th>
                <th className={thFluid}>
                  <div>水分 ml</div>
                  <div className="flex justify-around text-[9px] font-normal opacity-70"><span>AM</span><span>PM</span></div>
                </th>
                <th className={thMed}>
                  <div>服薬・口腔</div>
                  <div className="flex justify-around text-[9px] font-normal opacity-70 mt-0.5">
                    <span>朝</span><span>昼前</span><span>昼後</span><span>夕前</span><span>夕後</span><span>口腔</span>
                  </div>
                </th>
                <th className={thNote}>備考</th>
                <th className={thNote}>特記事項</th>
                <th className={thSave}>保存</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((resident, i) => {
                const d = getDraft(resident.id)
                const isAbsent = d.isAbsent ?? false
                const base = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                const missing = getMissing(resident.id)
                const rowBg = isAbsent ? 'bg-slate-100/80'
                  : missing.length === 0 ? base
                  : missing[0] === '未記録' ? 'bg-orange-50 hover:bg-orange-100/60'
                  : 'bg-amber-50/70 hover:bg-amber-100/60'
                return (<tr key={resident.id} id={`resident-${resident.id}`} className={`${rowBg} transition border-t border-gray-100 ${isAbsent ? 'opacity-60' : ''}`}>
                    {/* 名前 */}
                    <td className={td}>
                      <div className={`font-semibold leading-tight text-[11px] truncate ${isAbsent ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{resident.name}</div>
                      {isAbsent ? (
                        <div className="text-[9px] text-gray-400 mt-0.5">欠席</div>
                      ) : (
                        <>
                          <div className="text-[9px] text-gray-400 leading-tight truncate mt-0.5">
                            {resident.foodType ? resident.foodType.split(',').map(t => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                          </div>
                          {resident.foodRestrictions && <div className="text-red-500 text-[9px]">{resident.foodRestrictions}</div>}
                          {missing.length > 0 && (
                            <div title={missing.join('・')}
                              className={`text-[9px] font-medium mt-0.5 truncate ${missing[0] === '未記録' ? 'text-orange-600' : 'text-amber-600'}`}>
                              {missing[0] === '未記録' ? '⚠ 未記録' : `⚠ ${missing.length}項目未入力`}
                            </div>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => updMany(resident.id, { isAbsent: !isAbsent, absenceReason: isAbsent ? null : d.absenceReason })}
                        className={`mt-1 text-[9px] px-1.5 py-0.5 rounded border font-medium transition ${
                          isAbsent ? 'bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-300' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                        }`}>
                        {isAbsent ? '欠席中 ✕' : '欠席'}
                      </button>
                    </td>
                    {/* 血圧AM */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" list="dl-bp-sys" placeholder="収縮" min={70} max={200}
                          value={d.bpSystolic ?? ''} onChange={numHandler(resident.id, 'bpSystolic')}
                          className={numBase} style={{ ...inputStyle, width: '60px' }} />
                        <span className="text-gray-400 shrink-0">/</span>
                        <input type="number" list="dl-bp-dia" placeholder="拡張" min={30} max={200}
                          value={d.bpDiastolic ?? ''} onChange={numHandler(resident.id, 'bpDiastolic')}
                          className={numBase} style={{ ...inputStyle, width: '60px' }} />
                      </div>
                    </td>
                    {/* 血圧PM */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" list="dl-bp-sys" placeholder="収縮" min={70} max={200}
                          value={d.bpSystolicPm ?? ''} onChange={numHandler(resident.id, 'bpSystolicPm')}
                          className={numBase} style={{ ...inputStyle, width: '60px' }} />
                        <span className="text-gray-400 shrink-0">/</span>
                        <input type="number" list="dl-bp-dia" placeholder="拡張" min={30} max={200}
                          value={d.bpDiastolicPm ?? ''} onChange={numHandler(resident.id, 'bpDiastolicPm')}
                          className={numBase} style={{ ...inputStyle, width: '60px' }} />
                      </div>
                    </td>
                    {/* 脈拍 AM/PM */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" list="dl-pulse" placeholder="AM" min={30} max={200}
                          value={d.pulse ?? ''} onChange={numHandler(resident.id, 'pulse')}
                          className={numBase} style={{ ...inputStyle, width: '48px' }} />
                        <input type="number" list="dl-pulse" placeholder="PM" min={30} max={200}
                          value={d.pulsePm ?? ''} onChange={numHandler(resident.id, 'pulsePm')}
                          className={numBase} style={{ ...inputStyle, width: '48px' }} />
                      </div>
                    </td>
                    {/* 体温 AM/PM */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <input type="number" list="dl-temp" placeholder="AM" step="0.1" min={35} max={42}
                          value={d.tempMorning ?? ''} onChange={numHandler(resident.id, 'tempMorning')}
                          className={numBase} style={{ ...inputStyle, width: '48px' }} />
                        <input type="number" list="dl-temp" placeholder="PM" step="0.1" min={35} max={42}
                          value={d.tempAfternoon ?? ''} onChange={numHandler(resident.id, 'tempAfternoon')}
                          className={numBase} style={{ ...inputStyle, width: '48px' }} />
                      </div>
                    </td>
                    {/* 食事 主/副 */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <select value={d.mealMainFood ?? ''} onChange={e => upd(resident.id, 'mealMainFood', e.target.value !== '' ? +e.target.value : null)}
                          className="border border-gray-200 rounded px-0.5 py-0.5 text-xs w-[40px]">
                          <option value="">主</option>
                          {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <span className="text-gray-400">/</span>
                        <select value={d.mealSideFood ?? ''} onChange={e => upd(resident.id, 'mealSideFood', e.target.value !== '' ? +e.target.value : null)}
                          className="border border-gray-200 rounded px-0.5 py-0.5 text-xs w-[40px]">
                          <option value="">副</option>
                          {MEAL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </td>
                    {/* 水分 AM/PM（セレクト 50〜1000ml） */}
                    <td className={td}>
                      <div className="flex items-center gap-1 justify-center">
                        <select value={d.fluidIntakeAm ?? ''} onChange={e => upd(resident.id, 'fluidIntakeAm', e.target.value !== '' ? +e.target.value : null)}
                          className="border border-gray-200 rounded px-0.5 py-0.5 text-xs w-[46px]">
                          <option value="">AM</option>
                          {FLUID_SELECT.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <select value={d.fluidIntakePm ?? ''} onChange={e => upd(resident.id, 'fluidIntakePm', e.target.value !== '' ? +e.target.value : null)}
                          className="border border-gray-200 rounded px-0.5 py-0.5 text-xs w-[46px]">
                          <option value="">PM</option>
                          {FLUID_SELECT.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </td>
                    {/* 服薬・口腔（6チェックボックス） */}
                    <td className={`${td} text-center`}>
                      <div className="flex justify-around items-end">
                        {([
                          ['medicationMorning',      '朝'],
                          ['medicationBeforeLunch',  '昼前'],
                          ['medicationAfterLunch',   '昼後'],
                          ['medicationBeforeEvening','夕前'],
                          ['medicationEvening',      '夕後'],
                          ['oralCare',               '口腔'],
                        ] as const).map(([field, label]) => (
                          <label key={field} className="flex flex-col items-center gap-0.5 cursor-pointer">
                            <span className="text-[9px] text-gray-500 leading-tight">{label}</span>
                            <input type="checkbox" checked={!!(d as Record<string, unknown>)[field]}
                              onChange={e => upd(resident.id, field, e.target.checked)}
                              className="w-4 h-4 accent-blue-600" />
                          </label>
                        ))}
                      </div>
                    </td>
                    {/* 備考 */}
                    <td className={td}>
                      <input type="text" value={d.oralCareNote ?? ''} onChange={e => upd(resident.id, 'oralCareNote', e.target.value)}
                        placeholder="備考" className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs" />
                    </td>
                    {/* 特記 */}
                    <td className={td}>
                      <input type="text" value={d.specialNotes ?? ''} onChange={e => upd(resident.id, 'specialNotes', e.target.value)}
                        placeholder="体重・SpO2等" className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs" />
                    </td>
                    {/* 保存 */}
                    <td className={`${td} text-center`}>
                      <SaveBtn id={resident.id} />
                    </td>
                  </tr>)
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
