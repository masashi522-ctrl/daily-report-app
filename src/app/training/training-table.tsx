'use client'

import { useState, useEffect, useTransition } from 'react'
import { type Resident, type DailyRecord } from '@/types/database'
import { saveTrainingRecord, saveAllTraining } from './actions'

const SKIP_REASONS = [
  { value: 'REFUSAL',        label: '拒否' },
  { value: 'POOR_HEALTH',    label: '体調不良' },
  { value: 'VITAL_ABNORMAL', label: 'バイタル異常' },
  { value: 'FEVER',          label: '発熱' },
  { value: 'FRACTURE',       label: '骨折・受傷' },
  { value: 'INFECTION',      label: '感染症' },
  { value: 'DOCTOR_ORDER',   label: '医師指示' },
  { value: 'ABSENCE',        label: '欠席・早退' },
  { value: 'OTHER',          label: 'その他' },
]

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

interface Draft {
  trainingDone: boolean
  trainingSkipReason: string | null
  trainingSkipDetail: string | null
  trainingNote: string | null
  functionalTrainingStart: string | null
  functionalTrainingEnd: string | null
}

interface Props {
  residents: Resident[]
  recordMap: Record<string, DailyRecord>
  date: string
}

export default function TrainingTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [, startTransition] = useTransition()
  const [searchText, setSearchText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localRecords, setLocalRecords] = useState<Record<string, DailyRecord>>(recordMap)
  useEffect(() => { setLocalRecords(recordMap) }, [recordMap])

  function getDraft(id: string): Draft {
    const rec = localRecords[id]
    return drafts[id] ?? {
      trainingDone: rec?.trainingDone ?? false,
      trainingSkipReason: rec?.trainingSkipReason ?? null,
      trainingSkipDetail: rec?.trainingSkipDetail ?? null,
      trainingNote: rec?.trainingNote ?? null,
      functionalTrainingStart: rec?.functionalTrainingStart ?? null,
      functionalTrainingEnd: rec?.functionalTrainingEnd ?? null,
    }
  }

  function upd(id: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), ...patch } }))
  }

  function matchRow(r: Resident) {
    if (!gojuuonRow) return true
    const firstChar = (r.furigana ?? r.name)[0]
    const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
    return row ? row.chars.includes(firstChar) : true
  }

  const nameButtonList = residents.filter(r =>
    matchRow(r) &&
    (!searchText || r.name.includes(searchText) || (r.furigana ?? '').includes(searchText))
  )

  const filtered = nameButtonList.filter(r =>
    selectedIds.size === 0 || selectedIds.has(r.id)
  )

  function toggleResident(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearAll() {
    setSelectedIds(new Set())
    setSearchText('')
  }

  function handleSave(residentId: string) {
    setSaving(residentId)
    const d = getDraft(residentId)
    const rec = localRecords[residentId]
    startTransition(async () => {
      await saveTrainingRecord({ residentId, date, id: rec?.id, ...d })
      setSaving(null)
      setLocalRecords(prev => ({
        ...prev,
        [residentId]: { ...(prev[residentId] ?? {}), ...d, updatedAt: new Date().toISOString() } as DailyRecord,
      }))
      setDrafts(prev => { const next = { ...prev }; delete next[residentId]; return next })
    })
  }

  function handleSaveAll() {
    setSavingAll(true)
    const list = filtered.map(r => {
      const d = getDraft(r.id)
      const rec = localRecords[r.id]
      return { residentId: r.id, date, id: rec?.id, ...d }
    })
    startTransition(async () => {
      await saveAllTraining(list)
      setSavingAll(false)
      const updates: Record<string, DailyRecord> = {}
      for (const item of list) {
        updates[item.residentId] = {
          ...(localRecords[item.residentId] ?? {}),
          trainingDone: item.trainingDone ?? false,
          trainingSkipReason: item.trainingSkipReason ?? null,
          trainingSkipDetail: item.trainingSkipDetail ?? null,
          trainingNote: item.trainingNote ?? null,
          functionalTrainingStart: item.functionalTrainingStart ?? null,
          functionalTrainingEnd: item.functionalTrainingEnd ?? null,
          updatedAt: new Date().toISOString(),
        } as DailyRecord
      }
      setLocalRecords(prev => ({ ...prev, ...updates }))
      setDrafts({})
    })
  }

  const SaveBtn = ({ id }: { id: string }) => {
    const isDirty = !!drafts[id]
    const isSaved = !!localRecords[id]
    return (
      <button onClick={() => handleSave(id)} disabled={saving === id || savingAll}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
          saving === id        ? 'bg-gray-200 text-gray-400' :
          isSaved && !isDirty ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                                'bg-teal-600 text-white hover:bg-teal-700'
        }`}>
        {saving === id ? '保存中...' : isSaved && !isDirty ? '済' : '保存'}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 絞り込みパネル */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
        {/* テキスト検索 */}
        <div className="flex items-center gap-2 w-full">
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="名前で絞り込む..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
            style={{ fontSize: '16px' }}
          />
          {(searchText || selectedIds.size > 0) && (
            <button onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 whitespace-nowrap">✕ クリア</button>
          )}
          {selectedIds.size > 0 && (
            <span className="text-xs text-teal-600 font-medium whitespace-nowrap">{selectedIds.size}名選択中</span>
          )}
        </div>
        {/* 50音タブ */}
        <div className="flex flex-wrap gap-1 w-full">
          <span className="text-xs text-gray-400 self-center mr-1">50音:</span>
          <button
            onClick={() => setGojuuonRow(null)}
            className={`text-xs px-2 py-1 rounded border transition font-medium ${
              gojuuonRow === null
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'
            }`}
          >全</button>
          {GOJUUON_ROWS.map(row => (
            <button key={row.label}
              onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
              className={`text-xs px-2 py-1 rounded border transition ${
                gojuuonRow === row.label
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400 hover:text-teal-600'
              }`}
            >{row.label}</button>
          ))}
        </div>
        {/* 名前ボタン */}
        {nameButtonList.length > 0 ? (
          <div className="flex flex-wrap gap-1 w-full">
            {nameButtonList.map(r => {
              const isAbsent = localRecords[r.id]?.isAbsent === true
              const selected = selectedIds.has(r.id)
              return (
                <button key={r.id} onClick={() => toggleResident(r.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                    selected
                      ? 'bg-teal-600 text-white border-teal-600'
                      : isAbsent
                      ? 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
                  }`}>
                  {isAbsent && <span className="text-[9px]">欠</span>}
                  {r.name}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 w-full">{gojuuonRow ? `${gojuuonRow}行の対象者はいません` : ''}</p>
        )}
        {/* 全員保存 */}
        <div className="flex justify-end w-full gap-2 items-center">
          <p className="text-xs text-gray-400">{filtered.length}/{residents.length}名 表示中</p>
          <button onClick={handleSaveAll} disabled={savingAll}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition">
            {savingAll ? '保存中...' : `全員保存（${filtered.length}名）`}
          </button>
        </div>
      </div>

      {filtered.map(resident => {
        const d = getDraft(resident.id)
        const notDone = !d.trainingDone
        const rec = localRecords[resident.id]
        const isAbsent = rec?.isAbsent === true

        if (isAbsent) {
          return (
            <div key={resident.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-60">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-500 line-through">{resident.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">欠席</span>
                  {rec?.absenceReason && (
                    <span className="text-xs text-gray-400">{rec.absenceReason}</span>
                  )}
                </div>
              </div>
            </div>
          )
        }

        return (
          <div key={resident.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* カードヘッダー */}
            <div className="flex items-center justify-between px-4 py-2.5"
              style={{ background: 'linear-gradient(135deg, #ccfbf1 0%, #cffafe 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-teal-900">{resident.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  d.trainingDone ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>{d.trainingDone ? '実施済' : '未実施'}</span>
              </div>
              <SaveBtn id={resident.id} />
            </div>

            <div className="p-4 space-y-3">
              {/* 実施有無 */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">機能訓練の実施</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => upd(resident.id, {
                      trainingDone: true,
                      trainingSkipReason: null,
                      trainingSkipDetail: null,
                    })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      d.trainingDone
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                    }`}>
                    実施あり
                  </button>
                  <button
                    onClick={() => upd(resident.id, { trainingDone: false })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      !d.trainingDone
                        ? 'bg-red-400 text-white border-red-400'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-400'
                    }`}>
                    実施なし
                  </button>
                </div>
              </div>

              {/* 実施あり：時間入力 */}
              {d.trainingDone && (
                <div className="flex gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="flex-1">
                    <p className="text-xs text-emerald-600 font-medium mb-1">開始時刻</p>
                    <input
                      type="time"
                      value={d.functionalTrainingStart ?? ''}
                      onChange={e => upd(resident.id, { functionalTrainingStart: e.target.value || null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-emerald-600 font-medium mb-1">終了時刻</p>
                    <input
                      type="time"
                      value={d.functionalTrainingEnd ?? ''}
                      onChange={e => upd(resident.id, { functionalTrainingEnd: e.target.value || null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              )}

              {/* 実施なし：理由 */}
              {notDone && (
                <div className="space-y-2 p-3 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs font-medium text-red-600">実施なしの理由</p>
                  <select
                    value={d.trainingSkipReason ?? ''}
                    onChange={e => upd(resident.id, { trainingSkipReason: e.target.value || null })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                    style={{ fontSize: '16px' }}
                  >
                    <option value="">理由を選択...</option>
                    {SKIP_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={d.trainingSkipDetail ?? ''}
                    onChange={e => upd(resident.id, { trainingSkipDetail: e.target.value || null })}
                    placeholder="詳細を入力（任意）"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              )}

              {/* 備考 */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">備考</p>
                <input
                  type="text"
                  value={d.trainingNote ?? ''}
                  onChange={e => upd(resident.id, { trainingNote: e.target.value || null })}
                  placeholder="機能訓練に関するメモ"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {residents.length === 0 ? '対象者が登録されていません' : '該当する対象者がいません'}
        </div>
      )}
    </div>
  )
}
