'use client'

import { useState, useTransition } from 'react'
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

  function getDraft(id: string): Draft {
    const rec = recordMap[id]
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

  function handleSave(residentId: string) {
    setSaving(residentId)
    const d = getDraft(residentId)
    const rec = recordMap[residentId]
    startTransition(async () => {
      await saveTrainingRecord({ residentId, date, id: rec?.id, ...d })
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
      await saveAllTraining(list)
      setSavingAll(false)
    })
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
      {/* 全員保存 */}
      <div className="flex justify-end">
        <button onClick={handleSaveAll} disabled={savingAll}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition">
          {savingAll ? '保存中...' : `全員保存（${residents.length}名）`}
        </button>
      </div>

      {residents.map(resident => {
        const d = getDraft(resident.id)
        const notDone = !d.trainingDone

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

      {residents.length === 0 && (
        <div className="text-center py-12 text-gray-400">利用者が登録されていません</div>
      )}
    </div>
  )
}
