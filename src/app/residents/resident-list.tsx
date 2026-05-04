'use client'

import { useState, useTransition } from 'react'
import { FOOD_TYPE_LABELS, type FoodType, type Resident } from '@/types/database'
import { deleteResident, toggleActive, generateAllFurigana } from './actions'

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
}

export default function ResidentList({ residents, editId }: Props) {
  const [inputText, setInputText] = useState('')
  const [appliedText, setAppliedText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [generating, startGenerate] = useTransition()
  const [generateResult, setGenerateResult] = useState<string | null>(null)

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

  const filtered = residents.filter(r => {
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

  return (
    <div className="flex flex-col gap-3">
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
              <th className="px-3 py-2.5 text-left text-amber-700 font-semibold">食事形態</th>
              <th className="px-3 py-2.5 text-left text-sky-700 font-semibold">利用曜日</th>
              <th className="px-3 py-2.5 text-left text-red-600 font-semibold">禁止食品</th>
              <th className="px-3 py-2.5 text-left text-gray-600 font-semibold">特記事項</th>
              <th className="px-3 py-2.5 text-center text-emerald-700 font-semibold">状態</th>
              <th className="px-3 py-2.5 text-center text-gray-600 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} className={`border-t hover:bg-violet-50/40 transition ${editId === r.id ? 'bg-violet-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
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
                <td className="px-3 py-2 text-center">
                  <form action={toggleActive.bind(null, r.id, !r.isActive)}>
                    <button className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.isActive ? '在籍' : '退所'}
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <a href={`/residents?edit=${r.id}`} className="text-violet-500 hover:text-violet-700 text-xs font-medium">編集</a>
                    <form action={deleteResident.bind(null, r.id)}>
                      <button className="text-red-500 hover:text-red-700 text-xs">削除</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  {appliedText || gojuuonRow ? '該当する利用者が見つかりません' : '利用者が登録されていません'}
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
            {appliedText || gojuuonRow ? '該当する利用者が見つかりません' : '利用者が登録されていません'}
          </div>
        )}
        {filtered.map(r => (
          <div key={r.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${editId === r.id ? 'border-violet-400' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between px-4 py-2.5 mb-0" style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)' }}>
              <span className="font-semibold text-violet-900 text-base">{r.name}</span>
              <form action={toggleActive.bind(null, r.id, !r.isActive)}>
                <button className={`text-xs px-3 py-1 rounded-full font-medium ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {r.isActive ? '在籍' : '退所'}
                </button>
              </form>
            </div>
            <div className="p-4 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
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
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <a
                href={`/residents?edit=${r.id}`}
                className="flex-1 text-center text-sm py-2 rounded-lg bg-violet-50 text-violet-600 font-medium hover:bg-violet-100 transition"
              >編集</a>
              <form action={deleteResident.bind(null, r.id)} className="flex-1">
                <button className="w-full text-sm py-2 rounded-lg bg-red-50 text-red-500 font-medium hover:bg-red-100 transition">削除</button>
              </form>
            </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
