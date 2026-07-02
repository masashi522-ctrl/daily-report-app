'use client'

import { useState, useEffect, useTransition } from 'react'
import { type Resident, type DailyRecord, BATHING_CARE_ITEMS, BATHING_SPECIAL_ITEMS } from '@/types/database'
import { saveBathingRecord, saveAllBathing } from './actions'

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

const SKIP_REASONS = [
  { value: 'REFUSAL',        label: '拒否' },
  { value: 'POOR_HEALTH',    label: '体調不良' },
  { value: 'VITAL_ABNORMAL', label: 'バイタル異常' },
  { value: 'FEVER',          label: '発熱' },
  { value: 'SKIN_ISSUE',     label: '皮膚異常・傷' },
  { value: 'INFECTION',      label: '感染症' },
  { value: 'DIFFICULT',      label: '入浴困難' },
  { value: 'OTHER',          label: 'その他' },
]

interface Draft {
  bathing: string
  bathingSkipReason: string | null
  bathingSkipDetail: string | null
  bathingNote: string | null
  bathingCareChecks: string[]
}

interface Props {
  residents: Resident[]
  recordMap: Record<string, DailyRecord>
  date: string
}

export default function BathingTable({ residents, recordMap, date }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [, startTransition] = useTransition()
  const [searchText, setSearchText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localRecords, setLocalRecords] = useState<Record<string, DailyRecord>>(recordMap)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  useEffect(() => { setLocalRecords(recordMap) }, [recordMap])

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

  function getDraft(id: string): Draft {
    const rec = localRecords[id]
    return drafts[id] ?? {
      bathing: rec?.bathing ?? 'NOT_APPLICABLE',
      bathingSkipReason: rec?.bathingSkipReason ?? null,
      bathingSkipDetail: rec?.bathingSkipDetail ?? null,
      bathingNote: rec?.bathingNote ?? null,
      bathingCareChecks: rec?.bathingCareChecks ? rec.bathingCareChecks.split(',') : [],
    }
  }

  function upd(id: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), ...patch } }))
  }

  function handleSave(residentId: string) {
    setSaving(residentId)
    setSaveErrors(prev => { const next = { ...prev }; delete next[residentId]; return next })
    const d = getDraft(residentId)
    const rec = localRecords[residentId]
    startTransition(async () => {
      const { data: saved, error } = await saveBathingRecord({
        residentId, date, id: rec?.id, ...d,
        bathingCareChecks: d.bathingCareChecks.join(',') || null,
      })
      setSaving(null)
      if (error) {
        // 保存失敗時はローカル状態を書き換えず、下書きも残して再保存できるようにする
        setSaveErrors(prev => ({ ...prev, [residentId]: error }))
        return
      }
      setLocalRecords(prev => ({ ...prev, [residentId]: saved as DailyRecord }))
      setDrafts(prev => { const next = { ...prev }; delete next[residentId]; return next })
    })
  }

  function handleSaveAll() {
    setSavingAll(true)
    setSaveErrors({})
    const list = filtered.map(r => {
      const d = getDraft(r.id)
      const rec = localRecords[r.id]
      return {
        residentId: r.id, date, id: rec?.id, ...d,
        bathingCareChecks: d.bathingCareChecks.join(',') || null,
      }
    })
    startTransition(async () => {
      const results = await saveAllBathing(list)
      setSavingAll(false)
      const updates: Record<string, DailyRecord> = {}
      const errors: Record<string, string> = {}
      const savedIds = new Set<string>()
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const { data: saved, error } = results[i]
        if (error) {
          errors[item.residentId] = error
          continue
        }
        updates[item.residentId] = saved as DailyRecord
        savedIds.add(item.residentId)
      }
      setLocalRecords(prev => ({ ...prev, ...updates }))
      setSaveErrors(errors)
      // 保存に成功した利用者だけ下書きをクリアし、失敗分は再保存できるよう残す
      setDrafts(prev => {
        const next = { ...prev }
        for (const id of savedIds) delete next[id]
        return next
      })
    })
  }

  // バイタル表示用
  function vitalSummary(rec: DailyRecord | undefined) {
    if (!rec) return null
    const parts: string[] = []
    if (rec.bpSystolic != null) parts.push(`BP ${rec.bpSystolic}/${rec.bpDiastolic ?? '?'}`)
    if (rec.pulse != null) parts.push(`脈 ${rec.pulse}`)
    if (rec.tempMorning != null) parts.push(`体温 ${rec.tempMorning}℃`)
    return parts.length ? parts.join('　') : null
  }

  const SaveBtn = ({ id }: { id: string }) => {
    const isDirty = !!drafts[id]
    const isSaved = !!localRecords[id]
    const hasError = !!saveErrors[id]
    return (
      <button onClick={() => handleSave(id)} disabled={saving === id || savingAll}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
          saving === id        ? 'bg-gray-200 text-gray-400' :
          hasError             ? 'bg-red-500 text-white hover:bg-red-600' :
          isSaved && !isDirty ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                                'bg-teal-600 text-white hover:bg-teal-700'
        }`}>
        {saving === id ? '保存中...' : hasError ? '再試行' : isSaved && !isDirty ? '済' : '保存'}
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
              const isTemp = localRecords[r.id]?.isTemporaryAttendance === true
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
                  {isTemp && !isAbsent && <span className="text-[9px] text-orange-500">臨</span>}
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
          {Object.keys(saveErrors).length > 0 && (
            <p className="text-xs text-red-600 font-medium">{Object.keys(saveErrors).length}名の保存に失敗しました</p>
          )}
          <p className="text-xs text-gray-400">{filtered.length}/{residents.length}名 表示中</p>
          <button onClick={handleSaveAll} disabled={savingAll}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition">
            {savingAll ? '保存中...' : `全員保存（${filtered.length}名）`}
          </button>
        </div>
      </div>

      {filtered.map(resident => {
        const d = getDraft(resident.id)
        const rec = localRecords[resident.id]
        const vital = vitalSummary(rec)
        const notDone = d.bathing === 'NOT_DONE'
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
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-teal-900">{resident.name}</span>
                  {rec?.isTemporaryAttendance && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold border border-orange-200">臨時</span>
                  )}
                </div>
                {vital && (
                  <p className="text-xs text-teal-700 mt-0.5">{vital}</p>
                )}
                {!vital && (
                  <p className="text-xs text-gray-400 mt-0.5">バイタル未測定</p>
                )}
              </div>
              <SaveBtn id={resident.id} />
            </div>

            <div className="p-4 space-y-3">
              {saveErrors[resident.id] && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  保存に失敗しました。「再試行」を押してください。（{saveErrors[resident.id]}）
                </div>
              )}
              {/* 特記事項（利用者登録で設定した固定表示） */}
              {(resident.bathingSpecialItems || resident.bathingSpecialFreeText) && (() => {
                const items = resident.bathingSpecialItems
                  ? BATHING_SPECIAL_ITEMS.filter(s => resident.bathingSpecialItems!.split(',').includes(s.key))
                  : []
                return (
                  <div className="p-3 bg-sky-50 rounded-lg border border-sky-100">
                    <p className="text-[10px] font-semibold text-sky-700 mb-1.5">特記事項</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(s => (
                        <span key={s.key} className="text-xs bg-sky-100 text-sky-800 border border-sky-200 rounded-full px-2 py-0.5 font-medium">
                          {s.label}
                        </span>
                      ))}
                      {resident.bathingSpecialFreeText && (
                        <span className="text-xs bg-white text-gray-700 border border-sky-200 rounded-full px-2 py-0.5">
                          {resident.bathingSpecialFreeText}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* バイタル詳細（折りたたみ表示） */}
              {rec && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-rose-50 rounded-lg border border-rose-100">
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">血圧 AM</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.bpSystolic != null ? `${rec.bpSystolic}/${rec.bpDiastolic}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">血圧 PM</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.bpSystolicPm != null ? `${rec.bpSystolicPm}/${rec.bpDiastolicPm}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">脈拍 AM / PM</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.pulse != null ? rec.pulse : '-'}
                      {' / '}
                      {rec.pulsePm != null ? rec.pulsePm : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">体温 AM</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.tempMorning != null ? `${rec.tempMorning} ℃` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">体温 PM</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.tempAfternoon != null ? `${rec.tempAfternoon} ℃` : '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* 入浴状況 */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">入浴状況</p>
                <div className="flex gap-2">
                  {[
                    { value: 'DONE',           label: '入浴あり', color: 'emerald' },
                    { value: 'NOT_DONE',        label: '入浴なし', color: 'red' },
                    { value: 'NOT_APPLICABLE',  label: '対象外',  color: 'gray' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => upd(resident.id, {
                        bathing: opt.value,
                        bathingSkipReason: opt.value === 'NOT_DONE' ? d.bathingSkipReason : null,
                      })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                        d.bathing === opt.value
                          ? opt.color === 'emerald' ? 'bg-emerald-500 text-white border-emerald-500'
                          : opt.color === 'red'     ? 'bg-red-400 text-white border-red-400'
                          :                           'bg-gray-400 text-white border-gray-400'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 入浴なしの理由 */}
              {notDone && (
                <div className="space-y-2 p-3 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs font-medium text-red-600">入浴なしの理由</p>
                  <select
                    value={d.bathingSkipReason ?? ''}
                    onChange={e => upd(resident.id, { bathingSkipReason: e.target.value || null })}
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
                    value={d.bathingSkipDetail ?? ''}
                    onChange={e => upd(resident.id, { bathingSkipDetail: e.target.value || null })}
                    placeholder="詳細を入力（任意）"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              )}

              {/* ケア項目チェックリスト */}
              {resident.bathingCareItems && (() => {
                const enabledItems = BATHING_CARE_ITEMS.filter(c =>
                  resident.bathingCareItems!.split(',').includes(c.key)
                )
                if (enabledItems.length === 0) return null
                return (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <p className="text-[10px] font-semibold text-teal-700 mb-2">ケア項目</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {enabledItems.map(item => {
                        const checked = d.bathingCareChecks.includes(item.key)
                        return (
                          <label key={item.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? d.bathingCareChecks.filter(k => k !== item.key)
                                  : [...d.bathingCareChecks, item.key]
                                upd(resident.id, { bathingCareChecks: next })
                              }}
                              className="w-4 h-4 accent-teal-600 cursor-pointer"
                            />
                            <span className={`text-sm ${checked ? 'text-teal-800 font-medium' : 'text-gray-600'}`}>
                              {item.label}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* 備考 */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">備考</p>
                <input
                  type="text"
                  value={d.bathingNote ?? ''}
                  onChange={e => upd(resident.id, { bathingNote: e.target.value || null })}
                  placeholder="入浴に関するメモ"
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
