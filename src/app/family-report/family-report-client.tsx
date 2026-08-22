'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getSentDetail, type SentDetail } from './actions'

export type Cell = { status: 'SENT' | 'FAILED'; report: boolean; photo: boolean }

export type RowResident = {
  id: string
  name: string
  furigana: string | null
  enabled: boolean
  shareReport: boolean
  sharePhoto: boolean
  linked: number
  cells: Record<string, Cell | null>
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

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function dayLabel(date: string) {
  const [, m, d] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  return { md: `${m}/${d}`, dow: DOW[dow], isSun: dow === 0, isSat: dow === 6 }
}

export default function FamilyReportClient({
  dates,
  residents,
  today,
}: {
  dates: string[]
  residents: RowResident[]
  today: string
}) {
  const [inputText, setInputText] = useState('')
  const [appliedText, setAppliedText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [onlyEnabled, setOnlyEnabled] = useState(false)

  const [detail, setDetail] = useState<SentDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  const filtered = residents.filter(r => {
    if (onlyEnabled && !r.enabled) return false
    const matchName = !appliedText || r.name.includes(appliedText) || (r.furigana ?? '').includes(appliedText)
    if (!matchName) return false
    if (!gojuuonRow) return true
    const ch = (r.furigana ?? r.name)[0]
    const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
    return row ? row.chars.includes(ch) : true
  })

  const totalSent = residents.reduce(
    (n, r) => n + dates.filter(d => r.cells[d]?.status === 'SENT').length, 0)
  const totalFailed = residents.reduce(
    (n, r) => n + dates.filter(d => r.cells[d]?.status === 'FAILED').length, 0)

  function openDetail(residentId: string, date: string) {
    setDetailError(null)
    setDetail(null)
    startLoad(async () => {
      const res = await getSentDetail(residentId, date)
      if (res.error) setDetailError(res.error)
      else if (res.detail) setDetail(res.detail)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">家族連絡</h2>
          <p className="text-sm text-gray-500">
            直近2週間のLINE送信状況 ・ 送信 {totalSent}件
            {totalFailed > 0 && <span className="text-red-600"> ・ 失敗 {totalFailed}件</span>}
          </p>
        </div>
        <Link href="/report"
          className="px-3 py-1.5 text-sm rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 transition">
          連絡帳から送信する
        </Link>
      </div>

      {/* 検索 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text" value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setAppliedText(inputText) } }}
            placeholder="名前で検索..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
            style={{ fontSize: '16px' }}
          />
          <button type="button" onClick={() => setAppliedText(inputText)}
            className="px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 whitespace-nowrap">検索</button>
          {appliedText && (
            <button type="button" onClick={() => { setInputText(''); setAppliedText('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100">✕</button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-gray-400 self-center mr-1">50音:</span>
          <button type="button" onClick={() => setGojuuonRow(null)}
            className={`text-xs px-2 py-1 rounded border font-medium transition ${
              gojuuonRow === null ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'}`}>全</button>
          {GOJUUON_ROWS.map(row => (
            <button key={row.label} type="button"
              onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
              className={`text-xs px-2 py-1 rounded border transition ${
                gojuuonRow === row.label ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400 hover:text-teal-600'}`}>{row.label}</button>
          ))}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-400">{filtered.length}/{residents.length}名 表示中</p>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={onlyEnabled} onChange={e => setOnlyEnabled(e.target.checked)}
              className="w-3.5 h-3.5 accent-teal-600" />
            連絡が有効な利用者のみ表示
          </label>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded bg-teal-100 border border-teal-300 inline-block" />送信済み（押すと内容を表示）</span>
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded bg-red-100 border border-red-300 inline-block" />失敗</span>
        <span className="flex items-center gap-1.5"><i className="w-4 h-4 rounded bg-white border border-gray-200 inline-block" />送信なし</span>
      </div>

      {/* 表 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          該当する利用者がいません
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[70vh] overscroll-contain">
            <table className="border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 min-w-[150px]">
                    利用者
                  </th>
                  {dates.map(d => {
                    const { md, dow, isSun, isSat } = dayLabel(d)
                    return (
                      <th key={d}
                        className={`bg-gray-50 border-b border-gray-200 px-1 py-2 text-center text-[11px] font-semibold min-w-[46px] ${
                          isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-600'
                        } ${d === today ? 'bg-teal-50' : ''}`}>
                        <div>{md}</div>
                        <div className="font-normal text-[10px]">{dow}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 px-3 py-2">
                      <div className="font-medium text-gray-800 text-sm whitespace-nowrap">{r.name}</div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {!r.enabled ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">連絡なし</span>
                        ) : r.linked === 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">未連携</span>
                        ) : (
                          <>
                            {r.shareReport && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">連絡帳</span>}
                            {r.sharePhoto && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">写真</span>}
                            <span className="text-[10px] text-gray-400">{r.linked}名</span>
                          </>
                        )}
                      </div>
                    </td>
                    {dates.map(d => {
                      const c = r.cells[d]
                      if (!c) {
                        return <td key={d} className={`border-b border-gray-100 text-center ${d === today ? 'bg-teal-50/40' : ''}`}>
                          <span className="text-gray-200 text-xs">·</span>
                        </td>
                      }
                      const failed = c.status === 'FAILED'
                      return (
                        <td key={d} className={`border-b border-gray-100 p-0.5 text-center ${d === today ? 'bg-teal-50/40' : ''}`}>
                          <button
                            onClick={() => openDetail(r.id, d)}
                            title={`${r.name} ${d} の送信内容を表示`}
                            className={`w-9 h-9 rounded-md border text-[11px] font-semibold transition ${
                              failed
                                ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200'
                                : 'bg-teal-100 border-teal-300 text-teal-800 hover:bg-teal-200'
                            }`}>
                            {failed ? '×' : c.report && c.photo ? '帳写' : c.photo ? '写' : '帳'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 詳細 */}
      {(loading || detail || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setDetail(null); setDetailError(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-800">送信内容</h3>
                {detail && <p className="text-xs text-gray-400 mt-0.5">{detail.residentName} 様 ・ {detail.date}</p>}
              </div>
              <button onClick={() => { setDetail(null); setDetailError(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
              {loading && <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>}
              {detailError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{detailError}</div>
              )}

              {detail && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">送信先</p>
                    <div className="flex flex-col gap-1.5">
                      {detail.recipients.map((p, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">{p.name}</span>
                              {p.relationship && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.relationship}</span>}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {p.kinds.join('・')} ・ {new Date(p.sentAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {p.error && <p className="text-[11px] text-red-600 mt-0.5">{p.error}</p>}
                          </div>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            p.status === 'SENT' ? 'bg-teal-100 text-teal-700' : 'bg-red-100 text-red-700'
                          }`}>{p.status === 'SENT' ? '送信済み' : '失敗'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {detail.reportUrl && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">連絡帳</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={detail.reportUrl} alt="送信した連絡帳"
                        className="w-full rounded-lg border border-gray-200" />
                    </div>
                  )}

                  {detail.photoUrls.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">活動写真 {detail.photoUrls.length}枚</p>
                      <div className="grid grid-cols-2 gap-2">
                        {detail.photoUrls.map((u, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={u} alt={`活動写真 ${i + 1}`} className="w-full rounded-lg border border-gray-200" />
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.imageMissing && !detail.reportUrl && detail.photoUrls.length === 0 && (
                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      この送信は画像の保存先を記録する前のものです。送信した記録は残っていますが、内容は表示できません。
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
