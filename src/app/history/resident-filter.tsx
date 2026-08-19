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

// 過去記録の利用者選択。利用者管理の検索バーと同じ見た目・操作に揃えている。
// 選択した利用者は hidden input で親のGETフォームに渡す。
export default function HistoryResidentFilter({
  residents,
  selectedId,
}: {
  residents: Resident[]
  selectedId: string
}) {
  const [currentId, setCurrentId] = useState(selectedId)
  const [inputText, setInputText] = useState('')
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

      {/* テキスト検索（利用者管理と同じ配置） */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => {
            // Enterで記録の検索が走らないようにし、名前の絞り込みだけを行う
            if (e.key === 'Enter') {
              e.preventDefault()
              setAppliedText(inputText)
            }
          }}
          placeholder="名前で検索..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
          style={{ fontSize: '16px' }}
        />
        <button type="button" onClick={() => setAppliedText(inputText)}
          className="px-3 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 whitespace-nowrap"
        >検索</button>
        {appliedText && (
          <button type="button" onClick={() => { setInputText(''); setAppliedText('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 whitespace-nowrap">
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
              ? 'bg-violet-700 text-white border-violet-700'
              : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400'
          }`}
        >全</button>
        {GOJUUON_ROWS.map(row => (
          <button key={row.label} type="button"
            onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
            className={`text-xs px-2 py-1 rounded border transition ${
              gojuuonRow === row.label
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600'
            }`}
          >{row.label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-400">{filtered.length}/{residents.length}名 表示中</p>
        <p className="text-xs text-gray-500">
          対象:{' '}
          <span className={currentId ? 'font-medium text-violet-700' : 'text-gray-600'}>
            {currentId ? `${selectedName} 様` : '全員'}
          </span>
        </p>
      </div>

      {/* 氏名ボタン（クリックで対象を選択） */}
      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto overscroll-contain">
        <button type="button" onClick={() => setCurrentId('')}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition ${
            currentId === ''
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'
          }`}>
          全員
        </button>
        {filtered.map(r => (
          <button key={r.id} type="button" onClick={() => setCurrentId(r.id)}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition ${
              currentId === r.id
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'
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
