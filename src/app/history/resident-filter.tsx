'use client'

import { useState } from 'react'

interface Resident {
  id: string
  name: string
  furigana: string | null
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

// 過去記録の利用者選択。他の画面と同じく、名前検索と50音で絞り込めるようにする。
// 選択した利用者は hidden input で親のGETフォームに渡す。
export default function HistoryResidentFilter({
  residents,
  selectedId,
}: {
  residents: Resident[]
  selectedId: string
}) {
  const [currentId, setCurrentId] = useState(selectedId)
  const [searchText, setSearchText] = useState('')
  const [appliedText, setAppliedText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)

  const filtered = residents.filter(r => {
    const matchName = !appliedText ||
      r.name.includes(appliedText) ||
      (r.furigana ?? '').includes(appliedText)
    if (!matchName) return false
    if (!gojuuonRow) return true
    const searchChar = (r.furigana ?? r.name)[0]
    const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
    return row ? row.chars.includes(searchChar) : true
  })

  const selectedName = residents.find(r => r.id === currentId)?.name ?? ''

  return (
    <div className="w-full flex flex-col gap-2">
      <input type="hidden" name="residentId" value={currentId} />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600">利用者</span>
        <span className={`text-sm font-medium px-2 py-1 rounded-lg ${
          currentId ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600'
        }`}>
          {currentId ? selectedName : '全員'}
        </span>
        {currentId && (
          <button type="button" onClick={() => setCurrentId('')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
            全員に戻す
          </button>
        )}
      </div>

      {/* 名前検索 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => {
            // Enterでフォームが送信されないようにし、名前の絞り込みだけを行う
            if (e.key === 'Enter') {
              e.preventDefault()
              setAppliedText(searchText)
            }
          }}
          placeholder="名前で絞り込む..."
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
          style={{ fontSize: '16px' }}
        />
        <button type="button" onClick={() => setAppliedText(searchText)}
          className="px-3 py-2 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 whitespace-nowrap">
          絞り込む
        </button>
        {appliedText && (
          <button type="button" onClick={() => { setSearchText(''); setAppliedText('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100">
            ✕
          </button>
        )}
      </div>

      {/* 50音タブ */}
      <div className="flex flex-wrap gap-1">
        <span className="text-xs text-gray-400 self-center mr-1">50音:</span>
        <button type="button" onClick={() => setGojuuonRow(null)}
          className={`text-xs px-2 py-1 rounded border font-medium transition ${
            gojuuonRow === null
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
          }`}
        >全</button>
        {GOJUUON_ROWS.map(row => (
          <button key={row.label} type="button"
            onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
            className={`text-xs px-2 py-1 rounded border transition ${
              gojuuonRow === row.label
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
            }`}
          >{row.label}</button>
        ))}
      </div>

      {/* 名前ボタン */}
      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto overscroll-contain">
        <button type="button" onClick={() => setCurrentId('')}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition ${
            currentId === ''
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
          }`}>
          全員
        </button>
        {filtered.map(r => (
          <button key={r.id} type="button" onClick={() => setCurrentId(r.id)}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition ${
              currentId === r.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
            }`}>
            {r.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <span className="text-xs text-gray-400 py-1">該当する利用者がいません</span>
        )}
      </div>
    </div>
  )
}
