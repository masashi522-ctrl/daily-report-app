'use client'

import { updateResident } from './actions'
import { FOOD_TYPE_LABELS, type Resident } from '@/types/database'

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function EditResidentForm({ resident }: { resident: Resident }) {
  const action = updateResident.bind(null, resident.id)
  const checkedDays = resident.attendanceDays
    ? resident.attendanceDays.split(',').map(Number)
    : []
  const checkedFoodTypes = resident.foodType
    ? resident.foodType.split(',')
    : []

  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">名前 *</label>
        <input name="name" required defaultValue={resident.name}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">食事形態（複数可）</label>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {Object.entries(FOOD_TYPE_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="foodType" value={value}
                defaultChecked={checkedFoodTypes.includes(value)}
                className="w-4 h-4 accent-blue-600" />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">利用曜日</label>
        <div className="flex gap-1.5">
          {DAYS.map((day, i) => (
            <label key={i} className={`flex flex-col items-center gap-1 cursor-pointer select-none ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
              <span className="text-xs font-medium">{day}</span>
              <input type="checkbox" name="attendanceDays" value={i}
                defaultChecked={checkedDays.includes(i)}
                className="w-4 h-4 accent-blue-600" />
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">禁止食品・アレルギー</label>
        <input name="foodRestrictions" defaultValue={resident.foodRestrictions ?? ''}
          placeholder="例: 甲殻類、納豆禁"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">特記事項</label>
        <textarea name="specialCondition" rows={2} defaultValue={resident.specialCondition ?? ''}
          placeholder="例: インスリン、SpO2測定"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">表示順</label>
        <input name="sortOrder" type="number" defaultValue={resident.sortOrder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
      </div>
      <div className="flex gap-2 mt-1">
        <button type="submit"
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition">
          更新する
        </button>
        <a href="/residents"
          className="flex-1 text-center bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200 transition">
          キャンセル
        </a>
      </div>
    </form>
  )
}
