'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type FoodType, type Resident } from '@/types/database'
import { deleteResident, toggleActive, generateAllFurigana } from './actions'
import ResidentDetailModal, { serviceTimeLabel } from './resident-detail-modal'
import { hasLeftBy } from '@/lib/service-period'

/**
 * 在籍／退所のバッジ。ふだんは押して切り替えられるが、
 * 利用終了日を過ぎている方は日付で決まるため、ボタンにせず退所と表示する
 */
function EnrollmentBadge({ resident, today, padding }: { resident: Resident; today: string; padding: string }) {
  const style = (active: boolean) =>
    `text-xs ${padding} rounded-full font-medium ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`

  if (hasLeftBy(resident, today)) {
    return <span className={style(false)} title={`利用終了日 ${resident.serviceEndDate}`}>退所</span>
  }
  return (
    <form action={toggleActive.bind(null, resident.id, !resident.isActive)}>
      <button className={style(resident.isActive)}>{resident.isActive ? '在籍' : '退所'}</button>
    </form>
  )
}

/** 一覧の「提供時間」セル。開始〜終了と時間区分を縦に並べる */
function ServiceTimeCell({ resident, className = '' }: { resident: Resident; className?: string }) {
  const { range, category } = serviceTimeLabel(resident)
  if (!range && !category) return <span className="text-gray-400">-</span>
  return (
    <div className={`flex flex-col leading-tight ${className}`}>
      {range && <span className="text-gray-700">{range}</span>}
      {category && <span className="text-[10px] text-gray-400">{category}</span>}
    </div>
  )
}

/** 一覧の「要介護度」セル。要支援と要介護で色を分ける */
function CareLevelBadge({ careLevel }: { careLevel: string | null }) {
  if (!careLevel) return <span className="text-gray-400">-</span>
  const support = careLevel.startsWith('要支援')
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
      support ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {careLevel}
    </span>
  )
}

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

interface Props {
  residents: Resident[]
  editId?: string
  /** 在籍／退所の判定に使う日本時間の今日 */
  today: string
  /** 利用開始日が未入力のまま記録がある方のID */
  missingStartDateIds: string[]
  /** 日次記録の案内から開いたときは、はじめから該当者だけを表示する */
  initialOnlyMissingStartDate?: boolean
}

/** 入力漏れの目印 */
function WarningBadge({ label, title }: { label: string; title: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap bg-amber-50 text-amber-700 border border-amber-300"
      title={title}
    >
      {label}
    </span>
  )
}

const blank = (v: unknown) => !String(v ?? '').trim()

export default function ResidentList({
  residents,
  editId,
  today,
  missingStartDateIds,
  initialOnlyMissingStartDate = false,
}: Props) {
  // 集計に影響する入力漏れ。どれも「入っていないと静かに数字がずれる」項目にしぼっている
  const warnings = [
    {
      key: 'start-date',
      label: '利用開始日',
      badge: '開始日なし',
      detail: '記録があるため、実際に利用を始める前の月にも集計対象として並び、月次報告の「新規利用開始」にも出てきません。（登録から3か月以内の方のみ表示）',
      ids: new Set(missingStartDateIds),
    },
    {
      key: 'attendance-days',
      label: '利用曜日',
      badge: '曜日なし',
      detail: '毎日ご利用とみなして数えるため、翌月予測が多めに出ます。',
      ids: new Set(residents.filter(r => r.isActive && blank(r.attendanceDays)).map(r => r.id)),
    },
    {
      key: 'service-time',
      label: '提供時間',
      badge: '提供時間なし',
      detail: '時間区分も提供時刻も無いため、5時間以上（1.0人）として数えます。実質稼働率が多めに出ます。',
      ids: new Set(
        residents
          .filter(r => r.isActive && blank(r.serviceTimeCategory) && (blank(r.serviceStartTime) || blank(r.serviceEndTime)))
          .map(r => r.id),
      ),
    },
    {
      key: 'end-date',
      label: '利用終了日',
      badge: '終了日なし',
      detail: '退所の扱いですが終了日が無いため、いつまでの在籍だったかが集計に反映されません。',
      ids: new Set(residents.filter(r => !r.isActive && blank(r.serviceEndDate)).map(r => r.id)),
    },
  ].filter(w => w.ids.size > 0)

  const [warningFilter, setWarningFilter] = useState<string | null>(
    initialOnlyMissingStartDate ? 'start-date' : null,
  )
  const activeWarning = warnings.find(w => w.key === warningFilter) ?? null
  const [inputText, setInputText] = useState('')
  const [appliedText, setAppliedText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [generating, startGenerate] = useTransition()
  const [generateResult, setGenerateResult] = useState<string | null>(null)
  const [, startDelete] = useTransition()
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailResident = residents.find(r => r.id === detailId) ?? null

  function handleDelete(id: string) {
    startDelete(async () => {
      const result = await deleteResident(id)
      setDeleteErrors(prev => {
        const next = { ...prev }
        if (result.error) next[id] = result.error
        else delete next[id]
        return next
      })
    })
  }

  function applySearch() {
    setAppliedText(inputText)
  }

  function clearSearch() {
    setInputText('')
    setAppliedText('')
  }

  function handleGenerateAll() {
    setGenerateResult(null)
    startGenerate(async () => {
      const { updated, errors } = await generateAllFurigana()
      if (updated === 0 && errors === 0) {
        setGenerateResult('ふりがな未登録の利用者はいません')
      } else {
        setGenerateResult(`${updated}名のふりがなを生成しました${errors > 0 ? `（${errors}名失敗）` : ''}`)
      }
    })
  }

  const filtered = residents
    .filter(r => {
      if (activeWarning && !activeWarning.ids.has(r.id)) return false
      // テキスト検索：名前またはふりがなに含まれるか
      const matchName = !appliedText ||
        r.name.includes(appliedText) ||
        (r.furigana ?? '').includes(appliedText)
      if (!matchName) return false
      if (!gojuuonRow) return true
      // 50音：ふりがなの先頭文字を使用。なければ名前の先頭文字
      const searchChar = (r.furigana ?? r.name)[0]
      const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
      return row ? row.chars.includes(searchChar) : true
    })
    .sort((a, b) => {
      const fa = a.furigana ?? a.name
      const fb = b.furigana ?? b.name
      return fa.localeCompare(fb, 'ja')
    })

  return (
    <div className="flex flex-col gap-3">
      {/* 入力漏れ。どれも入っていないと集計が静かにずれる項目 */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-amber-900">利用者登録に入力漏れがあります</p>
          <ul className="flex flex-col gap-1.5">
            {warnings.map(w => (
              <li key={w.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-amber-900 flex-1 min-w-[16rem]">
                  <span className="font-medium">{w.label}が未入力 {w.ids.size}名</span>
                  <span className="block text-xs text-amber-800">{w.detail}</span>
                </span>
                <button
                  onClick={() => setWarningFilter(warningFilter === w.key ? null : w.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium whitespace-nowrap transition ${
                    warningFilter === w.key
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-amber-800 border-amber-300 hover:border-amber-500'
                  }`}
                >
                  {warningFilter === w.key ? '全員を表示' : '該当者だけ表示'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 検索バー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2">
        {/* テキスト検索 */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            placeholder="名前で検索..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={applySearch}
            className="px-3 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 whitespace-nowrap"
          >検索</button>
          {appliedText && (
            <button onClick={clearSearch}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 whitespace-nowrap">
              ✕
            </button>
          )}
        </div>
        {/* 50音タブ */}
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-gray-400 self-center mr-1">50音:</span>
          <button
            onClick={() => setGojuuonRow(null)}
            className={`text-xs px-2 py-1 rounded border font-medium transition ${
              gojuuonRow === null
                ? 'bg-violet-700 text-white border-violet-700'
                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400'
            }`}
          >全</button>
          {GOJUUON_ROWS.map(row => (
            <button key={row.label}
              onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
              className={`text-xs px-2 py-1 rounded border transition ${
                gojuuonRow === row.label
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600'
              }`}
            >{row.label}</button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{filtered.length}/{residents.length}名 表示中</p>
          <div className="flex items-center gap-2">
            {generateResult && (
              <span className="text-xs text-green-600">{generateResult}</span>
            )}
            <button
              onClick={handleGenerateAll}
              disabled={generating}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-violet-400 hover:text-violet-600 disabled:opacity-40 whitespace-nowrap"
            >
              {generating ? '生成中...' : 'ふりがな一括生成'}
            </button>
          </div>
        </div>
      </div>

      {/* デスクトップ: テーブル */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)' }}>
              <th className="px-4 py-2.5 text-left text-violet-800 font-semibold">名前</th>
              <th className="px-3 py-2.5 text-left text-amber-700 font-semibold">要介護度</th>
              <th className="px-3 py-2.5 text-left text-indigo-700 font-semibold">提供時間</th>
              <th className="px-3 py-2.5 text-left text-amber-700 font-semibold">食事形態</th>
              <th className="px-3 py-2.5 text-left text-sky-700 font-semibold">利用曜日</th>
              <th className="px-3 py-2.5 text-left text-red-600 font-semibold">禁止食品</th>
              <th className="px-3 py-2.5 text-left text-gray-600 font-semibold">特記事項</th>
              <th className="px-3 py-2.5 text-left text-teal-700 font-semibold">ゴールのイメージ</th>
              <th className="px-3 py-2.5 text-center text-emerald-700 font-semibold">状態</th>
              <th className="px-3 py-2.5 text-center text-gray-600 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} className={`border-t hover:bg-violet-50/40 transition ${editId === r.id ? 'bg-violet-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setDetailId(r.id)}
                      className="font-medium text-violet-700 hover:text-violet-900 hover:underline text-left"
                    >{r.name}</button>
                    {warnings.filter(w => w.ids.has(r.id)).map(w => (
                      <WarningBadge key={w.key} label={w.badge} title={`${w.label}が未入力です。${w.detail}`} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2"><CareLevelBadge careLevel={r.careLevel} /></td>
                <td className="px-3 py-2 text-xs"><ServiceTimeCell resident={r} /></td>
                <td className="px-3 py-2 text-gray-600 text-xs">
                  {r.foodType ? r.foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.attendanceDays
                    ? r.attendanceDays.split(',').map((d: string) => ['日','月','火','水','木','金','土'][+d]).join(' ')
                    : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-3 py-2 text-red-600 text-xs">{r.foodRestrictions ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate">{r.specialCondition ?? '-'}</td>
                <td className="px-3 py-2 text-xs max-w-[260px]">
                  {r.goalImage || r.subGoalImage ? (
                    <div className="flex flex-col gap-0.5">
                      {r.goalImage && (
                        <div className="flex items-start gap-1">
                          <span className="text-[9px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-px shrink-0 mt-px">メイン</span>
                          <span className="text-gray-700">{r.goalImage}</span>
                        </div>
                      )}
                      {(r.subGoalImage ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean).map((sub: string, si: number) => (
                        <div key={si} className="flex items-start gap-1">
                          <span className="text-[9px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-px shrink-0 mt-px">サブ</span>
                          <span className="text-gray-600">{sub}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <EnrollmentBadge resident={r} today={today} padding="px-2 py-0.5" />
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center justify-center gap-2">
                      <a href={`/residents?edit=${r.id}`} className="text-violet-500 hover:text-violet-700 text-xs font-medium">編集</a>
                      <button
                        onClick={() => {
                          if (confirm(`${r.name}さんを削除しますか？`)) handleDelete(r.id)
                        }}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >削除</button>
                    </div>
                    {deleteErrors[r.id] && (
                      <p className="text-[10px] text-red-600 max-w-[160px]">{deleteErrors[r.id]}</p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  {appliedText || gojuuonRow || activeWarning ? '該当する利用者が見つかりません' : '利用者が登録されていません'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* モバイル: カード */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
            {appliedText || gojuuonRow || activeWarning ? '該当する利用者が見つかりません' : '利用者が登録されていません'}
          </div>
        )}
        {filtered.map(r => (
          <div key={r.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${editId === r.id ? 'border-violet-400' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between px-4 py-2.5 mb-0" style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)' }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setDetailId(r.id)}
                  className="font-semibold text-violet-900 text-base underline decoration-violet-300 underline-offset-2 text-left"
                >{r.name}</button>
                {warnings.filter(w => w.ids.has(r.id)).map(w => (
                  <WarningBadge key={w.key} label={w.badge} title={`${w.label}が未入力です。${w.detail}`} />
                ))}
              </div>
              <EnrollmentBadge resident={r} today={today} padding="px-3 py-1" />
            </div>
            <div className="p-4 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
              <div>
                <p className="text-xs text-gray-400">要介護度</p>
                <p className="mt-0.5"><CareLevelBadge careLevel={r.careLevel} /></p>
              </div>
              <div>
                <p className="text-xs text-gray-400">提供時間</p>
                <ServiceTimeCell resident={r} className="text-xs mt-0.5" />
              </div>
              <div>
                <p className="text-xs text-gray-400">食事形態</p>
                <p className="text-xs text-gray-700 mt-0.5">
                  {r.foodType ? r.foodType.split(',').map((t: string) => FOOD_TYPE_LABELS[t as FoodType] ?? t).join('・') : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">利用曜日</p>
                <p className="text-xs text-gray-700 mt-0.5">
                  {r.attendanceDays
                    ? r.attendanceDays.split(',').map((d: string) => ['日','月','火','水','木','金','土'][+d]).join(' ')
                    : '-'}
                </p>
              </div>
              {r.foodRestrictions && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">禁止食品</p>
                  <p className="text-xs text-red-600 mt-0.5">{r.foodRestrictions}</p>
                </div>
              )}
              {r.specialCondition && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">特記事項</p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.specialCondition}</p>
                </div>
              )}
              {(r.goalImage || r.subGoalImage) && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">ゴールのイメージ</p>
                  <div className="flex flex-col gap-1 mt-0.5">
                    {r.goalImage && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-px shrink-0 mt-px">メイン</span>
                        <span className="text-xs text-gray-700">{r.goalImage}</span>
                      </div>
                    )}
                    {(r.subGoalImage ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean).map((sub: string, si: number) => (
                      <div key={si} className="flex items-start gap-1.5">
                        <span className="text-[9px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-px shrink-0 mt-px">サブ</span>
                        <span className="text-xs text-gray-600">{sub}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <a
                href={`/residents?edit=${r.id}`}
                className="flex-1 text-center text-sm py-2 rounded-lg bg-violet-50 text-violet-600 font-medium hover:bg-violet-100 transition"
              >編集</a>
              <button
                onClick={() => {
                  if (confirm(`${r.name}さんを削除しますか？`)) handleDelete(r.id)
                }}
                className="flex-1 text-sm py-2 rounded-lg bg-red-50 text-red-500 font-medium hover:bg-red-100 transition"
              >削除</button>
            </div>
            {deleteErrors[r.id] && (
              <p className="text-[10px] text-red-600 px-4 pb-3">{deleteErrors[r.id]}</p>
            )}
            </div>
          </div>
        ))}
      </div>

      {detailResident && (
        <ResidentDetailModal resident={detailResident} today={today} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}
