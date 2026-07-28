'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCarePlan } from './actions'
import { CARE_LEVEL_OPTIONS, type CarePlan } from '@/types/database'

interface Resident { id: string; name: string; furigana: string | null; careLevel: string | null }

interface Props {
  residents: Resident[]
  selectedResidentId: string
  selectedResident: Resident | null
  plan: CarePlan | null
}

const FIELDS: { name: keyof CarePlan; label: string; placeholder?: string; rows?: number }[] = [
  { name: 'lifeIssues',     label: '生活全般の解決すべき課題', rows: 3 },
  { name: 'longTermGoal',   label: '長期目標', rows: 2 },
  { name: 'shortTermGoal',  label: '短期目標', rows: 2 },
  { name: 'serviceContent', label: 'サービス内容（食事・入浴・機能訓練・口腔ケア・健康管理等）', rows: 4 },
  { name: 'considerations', label: '留意事項（本人・家族への配慮事項等）', rows: 2 },
  { name: 'notes',          label: '特記事項', rows: 2 },
]

export default function CarePlanClient({ residents, selectedResidentId, selectedResident, plan }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(saveCarePlan.bind(null, selectedResidentId), null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    if (state?.success) setSavedAt(new Date().toLocaleTimeString('ja-JP'))
  }, [state])

  useEffect(() => {
    setSavedAt(null)
  }, [selectedResidentId])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">介護計画書</h2>
        <span className="text-sm text-gray-500">対象: {residents.length}名</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 利用者選択 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {residents.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">利用者が登録されていません</p>
            )}
            {residents.map(r => (
              <button
                key={r.id}
                onClick={() => router.push(`/care-plan?resident=${r.id}`)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                  r.id === selectedResidentId
                    ? 'bg-teal-600 text-white font-medium'
                    : 'text-gray-700 hover:bg-teal-50'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* 計画書フォーム */}
        <div className="lg:col-span-3">
          {!selectedResident ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
              左の一覧から利用者を選択してください
            </div>
          ) : (
            <form action={formAction} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-semibold text-gray-800">{selectedResident.name} さんの介護計画書</h3>
                {plan?.updatedAt && (
                  <span className="text-xs text-gray-400">
                    最終更新: {new Date(plan.updatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成日</label>
                  <input type="date" name="planDate" defaultValue={plan?.planDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">次回評価日</label>
                  <input type="date" name="nextReviewDate" defaultValue={plan?.nextReviewDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">要介護度</label>
                  <select name="careLevel" defaultValue={plan?.careLevel ?? selectedResident.careLevel ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                    <option value="">未設定</option>
                    {CARE_LEVEL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成者</label>
                  <input type="text" name="staffName" defaultValue={plan?.staffName ?? ''}
                    placeholder="担当者名"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
              </div>

              {FIELDS.map(f => (
                <div key={f.name}>
                  <label className="text-xs font-medium text-gray-700 block mb-1">{f.label}</label>
                  <textarea name={f.name} defaultValue={(plan?.[f.name] as string) ?? ''}
                    rows={f.rows ?? 2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
                </div>
              ))}

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">家族・本人確認欄</label>
                <input type="text" name="familyConfirmation" defaultValue={plan?.familyConfirmation ?? ''}
                  placeholder="例: 2026/7/28 本人・家族へ説明し同意を得た"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
              </div>

              {state?.error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{state.error}</div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={pending}
                  className="bg-teal-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50">
                  {pending ? '保存中...' : '保存する'}
                </button>
                {savedAt && <span className="text-xs text-emerald-600">{savedAt} に保存しました</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
