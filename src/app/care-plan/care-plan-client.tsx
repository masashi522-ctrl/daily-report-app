'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Download } from 'lucide-react'
import { saveCarePlan } from './actions'
import { CARE_LEVEL_OPTIONS, type CarePlan, type CarePlanGoal } from '@/types/database'

interface Resident { id: string; name: string; furigana: string | null; careLevel: string | null }

interface Props {
  residents: Resident[]
  selectedResidentId: string
  selectedResident: Resident | null
  plan: CarePlan | null
  facilityName: string
}

const EMPTY_GOAL: CarePlanGoal = { issue: '', longTermGoal: '', shortTermGoal: '', serviceContent: '', frequency: '' }

export default function CarePlanClient({ residents, selectedResidentId, selectedResident, plan, facilityName }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(saveCarePlan.bind(null, selectedResidentId), null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [goals, setGoals] = useState<CarePlanGoal[]>(
    plan?.goals && plan.goals.length > 0 ? plan.goals : [{ ...EMPTY_GOAL }],
  )

  useEffect(() => {
    if (state?.success) setSavedAt(new Date().toLocaleTimeString('ja-JP'))
  }, [state])

  useEffect(() => {
    setSavedAt(null)
    setGoals(plan?.goals && plan.goals.length > 0 ? plan.goals : [{ ...EMPTY_GOAL }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResidentId])

  function updateGoal(index: number, field: keyof CarePlanGoal, value: string) {
    setGoals(prev => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)))
  }

  function addGoal() {
    setGoals(prev => [...prev, { ...EMPTY_GOAL }])
  }

  function removeGoal(index: number) {
    setGoals(prev => prev.filter((_, i) => i !== index))
  }

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
            <form action={formAction} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-5">
              <div className="text-center border-b border-gray-100 pb-3 relative">
                <h3 className="font-bold text-gray-800 text-lg tracking-widest">通所介護計画書</h3>
                {plan?.updatedAt && (
                  <span className="text-xs text-gray-400">
                    最終更新: {new Date(plan.updatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
                {plan && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <a
                      href={`/api/care-plan/export?residentId=${selectedResidentId}`}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition"
                    >
                      <Download size={13} /> Excelでダウンロード
                    </a>
                  </div>
                )}
              </div>

              {/* ヘッダー: 作成年月日・作成者・利用者氏名・生年月日・要介護 */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成年月日</label>
                  <input type="date" name="planDate" defaultValue={plan?.planDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成者</label>
                  <input type="text" name="staffName" defaultValue={plan?.staffName ?? ''}
                    placeholder="担当者名"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">生年月日</label>
                  <input type="date" name="birthDate" defaultValue={plan?.birthDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">要介護</label>
                  <select name="careLevel" defaultValue={plan?.careLevel ?? selectedResident.careLevel ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                    <option value="">未設定</option>
                    {CARE_LEVEL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">利用者氏名: {selectedResident.name} 様</p>

              <div>
                <label className="text-xs font-semibold text-teal-800 block mb-1">
                  【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】
                </label>
                <textarea name="needsAnalysis" defaultValue={plan?.needsAnalysis ?? ''} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-teal-800 block mb-1">【総合的な援助の方針】</label>
                <textarea name="supportPolicy" defaultValue={plan?.supportPolicy ?? ''} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-teal-800 block mb-1">【ゴールのイメージ】</label>
                <textarea name="goalImage" defaultValue={plan?.goalImage ?? ''} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
              </div>

              {/* 援助目標テーブル */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-teal-800">【援助目標】</label>
                  <button type="button" onClick={addGoal}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium">
                    <Plus size={13} /> 行を追加
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_0.6fr_auto] gap-2 px-1">
                    <span className="text-[10px] text-gray-400">解決すべき課題（ニーズ）</span>
                    <span className="text-[10px] text-gray-400">長期目標</span>
                    <span className="text-[10px] text-gray-400">短期目標</span>
                    <span className="text-[10px] text-gray-400">サービス内容</span>
                    <span className="text-[10px] text-gray-400">頻度</span>
                    <span />
                  </div>
                  {goals.map((g, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_0.6fr_auto] gap-2 p-2 bg-teal-50/40 rounded-lg border border-teal-100">
                      <input type="text" name="goalIssue" value={g.issue}
                        onChange={e => updateGoal(i, 'issue', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <input type="text" name="goalLongTerm" value={g.longTermGoal}
                        onChange={e => updateGoal(i, 'longTermGoal', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <input type="text" name="goalShortTerm" value={g.shortTermGoal}
                        onChange={e => updateGoal(i, 'shortTermGoal', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <input type="text" name="goalService" value={g.serviceContent}
                        onChange={e => updateGoal(i, 'serviceContent', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <input type="text" name="goalFrequency" value={g.frequency}
                        onChange={e => updateGoal(i, 'frequency', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <button type="button" onClick={() => removeGoal(i)} disabled={goals.length === 1}
                        className="flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-30 px-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* サービス達成状況 */}
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 flex flex-col gap-3">
                <label className="text-xs font-semibold text-sky-800">【サービス達成状況】</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">モニタリング日</label>
                    <input type="date" name="monitoringDate" defaultValue={plan?.monitoringDate ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">評価期間（開始）</label>
                    <input type="date" name="evaluationPeriodStart" defaultValue={plan?.evaluationPeriodStart ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">評価期間（終了）</label>
                    <input type="date" name="evaluationPeriodEnd" defaultValue={plan?.evaluationPeriodEnd ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">評価内容</label>
                  <textarea name="evaluationContent" defaultValue={plan?.evaluationContent ?? ''} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 resize-none" />
                </div>
              </div>

              {/* 説明・同意 */}
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-3">
                <p className="text-xs text-gray-600">上記の通所介護計画によりサービス提供を行います。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">説明日</label>
                    <input type="date" name="explanationDate" defaultValue={plan?.explanationDate ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">説明者</label>
                    <input type="text" name="explainerName" defaultValue={plan?.explainerName ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500">事業所名称：{facilityName}</p>
                <p className="text-xs text-gray-600">上記計画の内容について説明を受け同意し、交付されました。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">利用者同意署名欄</label>
                    <input type="text" name="familyConfirmation" defaultValue={plan?.familyConfirmation ?? ''}
                      placeholder="例: 本人・家族へ説明し同意を得た（同意日等）"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">代筆者署名欄（続柄）</label>
                    <input type="text" name="proxySigner" defaultValue={plan?.proxySigner ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
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
