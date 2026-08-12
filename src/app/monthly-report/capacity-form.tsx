'use client'

import { useActionState, useEffect, useState } from 'react'
import { saveFacilityCapacity } from './actions'
import { SERVICE_TIME_CATEGORIES, type Facility } from '@/types/database'

const CATEGORY_LABELS: Record<string, string> = {
  '3-4': '3〜4時間',
  '4-5': '4〜5時間',
  '5-6': '5〜6時間',
  '6-7': '6〜7時間',
  '7-8': '7〜8時間',
  '8-9': '8〜9時間',
}

export default function CapacityForm({
  facility,
  registeredCategoryCounts,
}: {
  facility: Pick<Facility, 'capacity' | 'capacityByCategory'>
  registeredCategoryCounts: Record<string, number>
}) {
  const [state, formAction, pending] = useActionState(saveFacilityCapacity, null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [open, setOpen] = useState(facility.capacity == null)

  useEffect(() => {
    if (state?.success) setSavedAt(new Date().toLocaleTimeString('ja-JP'))
  }, [state])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left">
        <span className="text-sm font-semibold text-gray-700">
          定員設定
          {facility.capacity == null && (
            <span className="ml-2 text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">未設定</span>
          )}
        </span>
        <span className="text-xs text-teal-600">{open ? '閉じる' : '編集'}</span>
      </button>
      {open && (
        <form action={formAction} className="flex flex-col gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">施設全体の定員（1日あたり）</label>
            <input type="number" min={0} name="capacity" defaultValue={facility.capacity ?? ''}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              時間区分別の定員（任意・入力した区分のみ稼働率を計算します）
            </label>
            <p className="text-[10px] text-gray-400 mb-1.5">
              未入力の区分は、利用者管理に登録されている現在の在籍者数を初期値として表示しています。必要に応じて調整してください。
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {SERVICE_TIME_CATEGORIES.map(cat => {
                const saved = facility.capacityByCategory?.[cat]
                const suggested = registeredCategoryCounts[cat]
                const defaultValue = saved ?? suggested ?? ''
                return (
                  <div key={cat}>
                    <label className="text-[10px] text-gray-500 block mb-0.5">
                      {CATEGORY_LABELS[cat]}
                      {saved == null && suggested != null && (
                        <span className="text-teal-600">（登録{suggested}名）</span>
                      )}
                    </label>
                    <input type="number" min={0} name={`cap_${cat}`} defaultValue={defaultValue}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                )
              })}
            </div>
          </div>
          {state?.error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{state.error}</div>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending}
              className="bg-teal-600 text-white rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-teal-700 transition disabled:opacity-50">
              {pending ? '保存中...' : '保存する'}
            </button>
            {savedAt && <span className="text-xs text-emerald-600">{savedAt} に保存しました</span>}
          </div>
        </form>
      )}
    </div>
  )
}
