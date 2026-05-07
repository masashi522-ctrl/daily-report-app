'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import { updateResident, generateFurigana } from './actions'
import { FOOD_TYPE_LABELS, CARE_LEVEL_OPTIONS, SERVICE_START_TIMES, type Resident } from '@/types/database'

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

function DayCheckboxes({ name, checkedDays }: { name: string; checkedDays: number[] }) {
  return (
    <div className="flex gap-1.5">
      {DAYS.map((day, i) => (
        <label key={i} className={`flex flex-col items-center gap-1 cursor-pointer select-none ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
          <span className="text-xs font-medium">{day}</span>
          <input type="checkbox" name={name} value={i}
            defaultChecked={checkedDays.includes(i)}
            className="w-4 h-4 accent-teal-600" />
        </label>
      ))}
    </div>
  )
}

export default function EditResidentForm({ resident }: { resident: Resident }) {
  const updateResidentWithId = updateResident.bind(null, resident.id)
  const [state, action, pending] = useActionState(updateResidentWithId, null)
  const [furigana, setFurigana] = useState(resident.furigana ?? '')
  const [generating, startGenerate] = useTransition()

  const checkedDays      = resident.attendanceDays ? resident.attendanceDays.split(',').map(Number) : []
  const checkedBathing   = resident.bathingDays    ? resident.bathingDays.split(',').map(Number)    : []
  const checkedFoodTypes = resident.foodType ? resident.foodType.split(',') : []

  useEffect(() => {
    if (resident.furigana) return
    startGenerate(async () => {
      const result = await generateFurigana(resident.name)
      setFurigana(prev => prev || result)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const name = e.target.value.trim()
    if (!name || furigana) return
    startGenerate(async () => {
      const result = await generateFurigana(name)
      setFurigana(prev => prev || result)
    })
  }

  function handleRegenerate(e: React.MouseEvent) {
    e.preventDefault()
    const nameInput = (e.currentTarget.closest('form') as HTMLFormElement)
      ?.elements.namedItem('name') as HTMLInputElement | null
    const name = nameInput?.value.trim()
    if (!name) return
    startGenerate(async () => {
      const result = await generateFurigana(name)
      if (result) setFurigana(result)
    })
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">名前 *</label>
        <input name="name" required defaultValue={resident.name}
          onBlur={handleNameBlur}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          ふりがな <span className="text-gray-400 font-normal">（50音検索に使用・自動生成）</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input name="furigana" placeholder="やまだ はなこ"
              value={furigana}
              onChange={e => setFurigana(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 pr-16" />
            {generating && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">生成中...</span>
            )}
          </div>
          <button onClick={handleRegenerate} disabled={generating}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 whitespace-nowrap disabled:opacity-40">
            再生成
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">食事形態（複数可）</label>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {Object.entries(FOOD_TYPE_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="foodType" value={value}
                defaultChecked={checkedFoodTypes.includes(value)}
                className="w-4 h-4 accent-teal-600" />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">利用曜日</label>
        <DayCheckboxes name="attendanceDays" checkedDays={checkedDays} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          入浴対象日 <span className="text-gray-400 font-normal text-[11px]">（入浴ページに自動表示）</span>
        </label>
        <DayCheckboxes name="bathingDays" checkedDays={checkedBathing} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">機能訓練</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="trainingTarget" value="1"
            defaultChecked={!!resident.trainingDays}
            className="w-4 h-4 accent-teal-600" />
          <span className="text-sm text-gray-700">機能訓練対象</span>
          <span className="text-gray-400 font-normal text-[11px]">（機能訓練ページに自動表示）</span>
        </label>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">要介護区分</label>
        <select name="careLevel" defaultValue={resident.careLevel ?? ''}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
          <option value="">未設定</option>
          {CARE_LEVEL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">サービス提供開始時間</label>
          <input name="serviceStartTime" list="start-times-edit"
            defaultValue={resident.serviceStartTime ?? ''} placeholder="例: 9:30"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
          <datalist id="start-times-edit">
            {SERVICE_START_TIMES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">サービス提供終了時間</label>
          <input name="serviceEndTime" list="end-times-edit"
            defaultValue={resident.serviceEndTime ?? ''} placeholder="例: 16:30"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
          <datalist id="end-times-edit">
            {SERVICE_START_TIMES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">禁止食品・アレルギー</label>
        <input name="foodRestrictions" defaultValue={resident.foodRestrictions ?? ''}
          placeholder="例: 甲殻類、納豆禁"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">特記事項</label>
        <textarea name="specialCondition" rows={2} defaultValue={resident.specialCondition ?? ''}
          placeholder="例: インスリン、SpO2測定"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">表示順</label>
        <input name="sortOrder" type="number" defaultValue={resident.sortOrder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
      </div>
      <div className="flex gap-2 mt-1">
        <button type="submit" disabled={pending}
          className="flex-1 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50">
          {pending ? '更新中...' : '更新する'}
        </button>
        <a href="/residents"
          className="flex-1 text-center bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200 transition">
          キャンセル
        </a>
      </div>
    </form>
  )
}
