'use client'

import { useState, useTransition } from 'react'
import { type Resident, type DailyRecord } from '@/types/database'
import { saveBathingRecord, saveAllBathing } from './actions'

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

  function getDraft(id: string): Draft {
    const rec = recordMap[id]
    return drafts[id] ?? {
      bathing: rec?.bathing ?? 'NOT_APPLICABLE',
      bathingSkipReason: rec?.bathingSkipReason ?? null,
      bathingSkipDetail: rec?.bathingSkipDetail ?? null,
      bathingNote: rec?.bathingNote ?? null,
    }
  }

  function upd(id: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), ...patch } }))
  }

  function handleSave(residentId: string) {
    setSaving(residentId)
    const d = getDraft(residentId)
    const rec = recordMap[residentId]
    startTransition(async () => {
      await saveBathingRecord({ residentId, date, id: rec?.id, ...d })
      setSaving(null)
    })
  }

  function handleSaveAll() {
    setSavingAll(true)
    const list = residents.map(r => {
      const d = getDraft(r.id)
      const rec = recordMap[r.id]
      return { residentId: r.id, date, id: rec?.id, ...d }
    })
    startTransition(async () => {
      await saveAllBathing(list)
      setSavingAll(false)
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
    const isSaved = !!recordMap[id]
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
      {/* 全員保存ボタン */}
      <div className="flex justify-end">
        <button onClick={handleSaveAll} disabled={savingAll}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition">
          {savingAll ? '保存中...' : `全員保存（${residents.length}名）`}
        </button>
      </div>

      {residents.map(resident => {
        const d = getDraft(resident.id)
        const rec = recordMap[resident.id]
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
                <span className="font-semibold text-teal-900">{resident.name}</span>
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
              {/* バイタル詳細（折りたたみ表示） */}
              {rec && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-rose-50 rounded-lg border border-rose-100">
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
                    <p className="text-[10px] text-rose-500 font-medium">脈拍</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.pulse != null ? `${rec.pulse} 回/分` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-medium">体温</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {rec.tempMorning != null ? `${rec.tempMorning} ℃` : '-'}
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

      {residents.length === 0 && (
        <div className="text-center py-12 text-gray-400">利用者が登録されていません</div>
      )}
    </div>
  )
}
