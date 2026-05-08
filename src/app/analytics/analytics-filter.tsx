'use client'

import { useState } from 'react'

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

interface Resident { id: string; name: string; furigana: string | null }

export default function AnalyticsFilter({
  residents,
  residentId,
  year,
  month,
  total,
}: {
  residents: Resident[]
  residentId: string
  year: number
  month: number
  total: number
}) {
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const filtered = residents.filter(r => {
    if (searchText) return r.name.includes(searchText) || (r.furigana ?? '').includes(searchText)
    if (gojuuonRow) {
      const char = (r.furigana ?? r.name)[0]
      const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
      return row ? row.chars.includes(char) : true
    }
    return true
  })

  function selectRow(label: string | null) {
    setGojuuonRow(label)
    setSearchText('')
  }

  return (
    <form className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-end">
        {/* 利用者選択 */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-xs text-gray-600">利用者</label>

          {/* 50音タブ */}
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => selectRow(null)}
              className={`text-xs px-2 py-0.5 rounded border font-medium transition ${
                gojuuonRow === null && !searchText
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
              }`}>全</button>
            {GOJUUON_ROWS.map(row => (
              <button type="button" key={row.label}
                onClick={() => selectRow(gojuuonRow === row.label ? null : row.label)}
                className={`text-xs px-2 py-0.5 rounded border transition ${
                  gojuuonRow === row.label
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}>{row.label}</button>
            ))}
          </div>

          {/* テキスト絞り込み */}
          <input type="text" value={searchText}
            onChange={e => { setSearchText(e.target.value); setGojuuonRow(null) }}
            placeholder="名前で絞り込み..."
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-48 focus:outline-none focus:border-blue-400" />

          {/* 利用者セレクト */}
          <select name="residentId" defaultValue={residentId}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">全員</option>
            {filtered.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* 年 */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">年</label>
          <input type="number" name="year" defaultValue={year} min="2020" max="2099"
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* 月 */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">月</label>
          <select name="month" defaultValue={month}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}月</option>
            ))}
          </select>
        </div>

        <button type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          集計
        </button>

        {!residentId && (
          <a href={`/api/analytics/export?year=${year}&month=${month}`}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5"
            download>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            全員 Excel
          </a>
        )}

        <span className="text-xs text-gray-400 self-end mb-2">記録 {total}件</span>
      </div>
    </form>
  )
}
