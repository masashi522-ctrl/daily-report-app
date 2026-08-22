'use client'

import Link from 'next/link'
import { useActionState, useRef, useState, useTransition, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { updateResident, generateFurigana, guessGender } from './actions'
import GoalImageField from './goal-image-field'
import { FOOD_TYPE_LABELS, CARE_LEVEL_OPTIONS, SERVICE_START_TIMES, SERVICE_TIME_CATEGORIES, BATHING_CARE_ITEMS, BATHING_SPECIAL_ITEMS, type Resident, type HospitalizationPeriod } from '@/types/database'

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

function HospitalizationEditor({
  periods,
  onChange,
}: {
  periods: HospitalizationPeriod[]
  onChange: (periods: HospitalizationPeriod[]) => void
}) {
  function update(i: number, field: keyof HospitalizationPeriod, value: string) {
    onChange(periods.map((p, idx) => (idx === i ? { ...p, [field]: value || null } : p)))
  }
  function add() {
    onChange([...periods, { admissionDate: '', dischargeDate: null }])
  }
  function remove(i: number) {
    onChange(periods.filter((_, idx) => idx !== i))
  }

  return (
    <div className="border border-amber-100 rounded-lg p-3 bg-amber-50/40">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-amber-800">
          入退院期間
          <span className="ml-1 font-normal text-gray-400">（複数回登録可・退院日未定なら空欄のまま）</span>
        </label>
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium">
          <Plus size={13} /> 追加
        </button>
      </div>
      {periods.length === 0 ? (
        <p className="text-xs text-gray-400">入退院履歴はありません</p>
      ) : (
        <div className="flex flex-col gap-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" name="hospAdmission" value={p.admissionDate}
                onChange={e => update(i, 'admissionDate', e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-400" />
              <span className="text-xs text-gray-400">〜</span>
              <input type="date" name="hospDischarge" value={p.dischargeDate ?? ''}
                onChange={e => update(i, 'dischargeDate', e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-400" />
              <button type="button" onClick={() => remove(i)}
                className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const FORM_ID = 'edit-resident-form'

export default function EditResidentForm({
  resident,
  children,
}: {
  resident: Resident
  /** フォームの下・更新ボタンの上に差し込む欄（ご家族への連絡など）。
   *  入れ子の form は無効になるため、form の外に置いて form 属性でつなぐ */
  children?: React.ReactNode
}) {
  const updateResidentWithId = updateResident.bind(null, resident.id)
  const [state, action, pending] = useActionState(updateResidentWithId, null)
  const [furigana, setFurigana] = useState(resident.furigana ?? '')
  const [generating, startGenerate] = useTransition()
  const [hospitalizations, setHospitalizations] = useState<HospitalizationPeriod[]>(
    resident.hospitalizations ?? [],
  )

  const checkedDays         = resident.attendanceDays    ? resident.attendanceDays.split(',').map(Number) : []
  const checkedBathing      = resident.bathingDays       ? resident.bathingDays.split(',').map(Number)    : []
  const checkedFoodTypes    = resident.foodType          ? resident.foodType.split(',')                   : []
  const checkedCareItems    = resident.bathingCareItems   ? resident.bathingCareItems.split(',')           : []
  const checkedSpecialItems = resident.bathingSpecialItems ? resident.bathingSpecialItems.split(',')       : []

  const [gender, setGender] = useState(resident.gender ?? '')
  const [genderSuggested, setGenderSuggested] = useState(false)
  // 職員が選び直したかどうかを即座に判定するため、選択中の値をrefでも保持する
  const genderRef = useRef(resident.gender ?? '')

  function changeGender(value: string) {
    genderRef.current = value
    setGender(value)
    setGenderSuggested(false)
  }

  useEffect(() => {
    if (resident.furigana && genderRef.current) return
    startGenerate(async () => {
      if (!resident.furigana) {
        const result = await generateFurigana(resident.name)
        setFurigana(prev => prev || result)
      }
      // 既存の利用者で性別が未登録なら、氏名から候補を推定して入れる
      if (!genderRef.current) {
        const guessed = await guessGender(resident.name)
        if (guessed && !genderRef.current) {
          genderRef.current = guessed
          setGender(guessed)
          setGenderSuggested(true)
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const name = e.target.value.trim()
    if (!name) return
    startGenerate(async () => {
      if (!furigana) {
        const result = await generateFurigana(name)
        setFurigana(prev => prev || result)
      }
      // 性別が未選択のときだけ、氏名から候補を推定して入れる
      if (!genderRef.current) {
        const guessed = await guessGender(name)
        if (guessed && !genderRef.current) {
          genderRef.current = guessed
          setGender(guessed)
          setGenderSuggested(true)
        }
      }
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
    <>
    <form id={FORM_ID} action={action} className="flex flex-col gap-3">
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
      {/* 入浴特記事項 */}
      <div className="border border-sky-100 rounded-lg p-3 bg-sky-50/40">
        <label className="text-xs font-semibold text-sky-800 block mb-2">
          入浴特記事項
          <span className="ml-1 font-normal text-gray-400">（入浴記録で常に表示されます）</span>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2">
          {BATHING_SPECIAL_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="bathingSpecialItems" value={item.key}
                defaultChecked={checkedSpecialItems.includes(item.key)}
                className="w-4 h-4 accent-sky-600" />
              <span className="text-sm text-gray-700">{item.label}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">自由記載</label>
          <input name="bathingSpecialFreeText"
            defaultValue={resident.bathingSpecialFreeText ?? ''}
            placeholder="例: 腰痛あり、お湯は低め"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-400" />
        </div>
      </div>

      {/* 入浴ケア項目 */}
      <div className="border border-teal-100 rounded-lg p-3 bg-teal-50/40">
        <label className="text-xs font-semibold text-teal-800 block mb-2">
          入浴ケア項目
          <span className="ml-1 font-normal text-gray-400">（この利用者に必要な項目にチェック）</span>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {BATHING_CARE_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="bathingCareItems" value={item.key}
                defaultChecked={checkedCareItems.includes(item.key)}
                className="w-4 h-4 accent-teal-600" />
              <span className="text-sm text-gray-700">{item.label}</span>
            </label>
          ))}
        </div>
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
        <label className="text-xs font-medium text-gray-700 block mb-1">体重測定</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="weightMeasureEveryVisit" value="1"
            defaultChecked={!!resident.weightMeasureEveryVisit}
            className="w-4 h-4 accent-teal-600" />
          <span className="text-sm text-gray-700">毎回利用時に体重測定</span>
          <span className="text-gray-400 font-normal text-[11px]">（利用日に体重ページで強調表示）</span>
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
          <label className="text-xs font-medium text-gray-700 block mb-1">提供開始時間</label>
          <input name="serviceStartTime" list="start-times-edit"
            defaultValue={resident.serviceStartTime ?? ''} placeholder="例: 9:30"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
          <datalist id="start-times-edit">
            {SERVICE_START_TIMES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">提供終了時間</label>
          <input name="serviceEndTime" list="end-times-edit"
            defaultValue={resident.serviceEndTime ?? ''} placeholder="例: 16:30"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
          <datalist id="end-times-edit">
            {SERVICE_START_TIMES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">提供時間区分</label>
        <select name="serviceTimeCategory" defaultValue={resident.serviceTimeCategory ?? ''}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
          <option value="">未設定</option>
          {SERVICE_TIME_CATEGORIES.map(v => <option key={v} value={v}>{v}時間</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">利用開始日</label>
          <input type="date" name="serviceStartDate" defaultValue={resident.serviceStartDate ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            利用中止日 <span className="text-gray-400 font-normal text-[11px]">（入力すると自動的に退所扱い）</span>
          </label>
          <input type="date" name="serviceEndDate" defaultValue={resident.serviceEndDate ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
        </div>
      </div>
      <HospitalizationEditor periods={hospitalizations} onChange={setHospitalizations} />
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
      <GoalImageField gender={gender} onGenderChange={changeGender} genderSuggested={genderSuggested} defaultGoalImage={resident.goalImage} defaultSubGoalImage={resident.subGoalImage} />
    </form>

    {children}

    {/* 更新ボタンは画面のいちばん下に置く。form の外にあるため form 属性で結びつける */}
    <div className="flex gap-2 mt-5">
      <button type="submit" form={FORM_ID} disabled={pending}
        className="flex-1 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50">
        {pending ? '更新中...' : '更新する'}
      </button>
      <Link href="/residents"
        className="flex-1 text-center bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200 transition">
        キャンセル
      </Link>
    </div>
    </>
  )
}
