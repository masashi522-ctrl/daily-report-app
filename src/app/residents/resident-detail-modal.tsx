'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import {
  BATHING_CARE_ITEMS,
  BATHING_SPECIAL_ITEMS,
  FOOD_TYPE_LABELS,
  type FoodType,
  type Resident,
} from '@/types/database'
import { hasLeftBy } from '@/lib/service-period'

const DAYS =['日', '月', '火', '水', '木', '金', '土']

function daysLabel(days: string | null) {
  if (!days) return null
  return days.split(',').map((d: string) => DAYS[+d]).join(' ')
}

function foodTypeLabel(foodType: string | null) {
  if (!foodType) return null
  return foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・')
}

function itemsLabel(csv: string | null, items: readonly { key: string; label: string }[]) {
  if (!csv) return null
  const keys = csv.split(',')
  return items.filter(i => keys.includes(i.key)).map(i => i.label).join('・') || null
}

/** 提供時間。開始〜終了の範囲と、時間区分をそれぞれ返す */
export function serviceTimeLabel(
  r: Pick<Resident, 'serviceStartTime' | 'serviceEndTime' | 'serviceTimeCategory'>,
) {
  const range = r.serviceStartTime && r.serviceEndTime
    ? `${r.serviceStartTime}〜${r.serviceEndTime}`
    : r.serviceStartTime || r.serviceEndTime || null
  const category = r.serviceTimeCategory ? `${r.serviceTimeCategory}時間` : null
  return { range, category }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <p className="text-[11px] text-gray-400">{label}</p>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  )
}

function Empty() {
  return <span className="text-gray-300">未設定</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // shrink-0: スクロール領域の flex 子要素として潰れ、中身が切れるのを防ぐ
  return (
    <div className="shrink-0 border border-gray-200 rounded-lg overflow-hidden">
      <p className="px-3 py-1.5 text-xs font-semibold text-violet-800 bg-violet-50/70 border-b border-gray-200">{title}</p>
      <div className="px-3 py-1.5 grid grid-cols-2 gap-x-4">{children}</div>
    </div>
  )
}

export default function ResidentDetailModal({
  resident,
  today,
  onClose,
}: {
  resident: Resident
  /** 在籍／退所の判定に使う日本時間の今日 */
  today: string
  onClose: () => void
}) {
  // Escキーでも閉じられるようにする
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const r = resident
  // 利用終了日を過ぎていれば、isActive の値にかかわらず退所として扱う
  const enrolled = r.isActive && !hasLeftBy(r, today)
  const { range, category } = serviceTimeLabel(r)
  const subGoals = (r.subGoalImage ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const hospitalizations = r.hospitalizations ?? []

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3"
      onClick={onClose}
    >
      {/* 画面の高さに収め、中身だけをスクロールさせる */}
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 rounded-t-xl"
          style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)' }}>
          <div>
            {r.furigana && <p className="text-[11px] text-violet-600">{r.furigana}</p>}
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-violet-900">{r.name}</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${enrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                {enrolled ? '在籍' : '退所'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-violet-500 hover:text-violet-800 p-1" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 flex flex-col gap-3">
          <Section title="基本情報">
            <Row label="性別">{r.gender || <Empty />}</Row>
            <Row label="要介護区分">{r.careLevel || <Empty />}</Row>
            <Row label="提供時間">{range || <Empty />}</Row>
            <Row label="提供時間区分">{category || <Empty />}</Row>
            <Row label="利用開始日">{r.serviceStartDate || <Empty />}</Row>
            <Row label="利用終了日">{r.serviceEndDate || <Empty />}</Row>
          </Section>

          <Section title="利用予定">
            <Row label="利用曜日">{daysLabel(r.attendanceDays) || <Empty />}</Row>
            <Row label="入浴曜日">{daysLabel(r.bathingDays) || <Empty />}</Row>
            <Row label="機能訓練">{r.trainingDays ? '対象' : <Empty />}</Row>
            <Row label="体重測定">{r.weightMeasureEveryVisit ? '毎回利用時に測定' : <Empty />}</Row>
          </Section>

          <Section title="食事">
            <Row label="食事形態">{foodTypeLabel(r.foodType) || <Empty />}</Row>
            <Row label="禁止食品">
              {r.foodRestrictions ? <span className="text-red-600">{r.foodRestrictions}</span> : <Empty />}
            </Row>
          </Section>

          <Section title="入浴">
            <div className="col-span-2">
              <Row label="入浴介助項目">{itemsLabel(r.bathingCareItems, BATHING_CARE_ITEMS) || <Empty />}</Row>
              <Row label="入浴時の特記事項">
                {itemsLabel(r.bathingSpecialItems, BATHING_SPECIAL_ITEMS) || <Empty />}
              </Row>
              {r.bathingSpecialFreeText && (
                <Row label="入浴の自由記載">{r.bathingSpecialFreeText}</Row>
              )}
            </div>
          </Section>

          <Section title="特記事項・ゴール">
            <div className="col-span-2">
              <Row label="特記事項">
                {r.specialCondition
                  ? <span className="whitespace-pre-wrap">{r.specialCondition}</span>
                  : <Empty />}
              </Row>
              <Row label="ゴールのイメージ">
                {r.goalImage || subGoals.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {r.goalImage && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-px shrink-0 mt-1">メイン</span>
                        <span>{r.goalImage}</span>
                      </div>
                    )}
                    {subGoals.map((sub, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[9px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-px shrink-0 mt-1">サブ</span>
                        <span className="text-gray-600">{sub}</span>
                      </div>
                    ))}
                  </div>
                ) : <Empty />}
              </Row>
            </div>
          </Section>

          {hospitalizations.length > 0 && (
            <Section title="入退院期間">
              <div className="col-span-2 py-1.5 flex flex-col gap-0.5">
                {hospitalizations.map((h, i) => (
                  <p key={i} className="text-sm text-gray-800">
                    {h.admissionDate} 〜 {h.dischargeDate || <span className="text-amber-600">入院中</span>}
                  </p>
                ))}
              </div>
            </Section>
          )}

          <Section title="ご家族への連絡">
            <Row label="LINE連絡">{r.familyContactEnabled ? '有効' : '無効'}</Row>
            <Row label="共有する内容">
              {r.familyContactEnabled
                ? [r.shareDailyReport && '連絡帳', r.shareActivityPhoto && '活動写真'].filter(Boolean).join('・') || 'なし'
                : <Empty />}
            </Row>
          </Section>
        </div>

        {/* フッター */}
        <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-gray-100 bg-white rounded-b-xl">
          <a href={`/residents?edit=${r.id}`}
            className="flex-1 text-center text-sm py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition">
            編集する
          </a>
          <button onClick={onClose}
            className="flex-1 text-sm py-2 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
