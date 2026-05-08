'use client'

import { useActionState, useMemo, useState } from 'react'
import { saveWeight } from './actions'

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

// ── SVG折れ線グラフ ──────────────────────────────────────────────────
function WeightChart({ data }: { data: { label: string; weight: number | null }[] }) {
  const points = data.filter(d => d.weight != null) as { label: string; weight: number }[]
  if (points.length === 0) {
    return <div className="flex items-center justify-center h-28 text-xs text-gray-400">データなし</div>
  }

  const W = 560; const H = 120
  const PAD = { top: 12, right: 16, bottom: 28, left: 40 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const n = data.length

  const weights = points.map(p => p.weight)
  const rawMin = Math.min(...weights)
  const rawMax = Math.max(...weights)
  const span = rawMax - rawMin < 2 ? 2 : rawMax - rawMin
  const dataMin = Math.floor(rawMin - span * 0.1)
  const dataMax = Math.ceil(rawMax + span * 0.1)
  const dataRange = dataMax - dataMin || 1

  const xScale = (i: number) => PAD.left + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW)
  const yScale = (v: number) => PAD.top + (1 - (v - dataMin) / dataRange) * cH

  const gridVals = Array.from({ length: 5 }, (_, i) => dataMin + (i / 4) * dataRange)

  let pathD = ''
  data.forEach((d, i) => {
    if (d.weight == null) return
    const x = xScale(i); const y = yScale(d.weight)
    pathD += pathD === '' ? `M ${x} ${y}` : ` L ${x} ${y}`
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      {gridVals.map((v, gi) => {
        const y = yScale(v)
        return (
          <g key={gi}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="#9ca3af">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="7.5" fill="#9ca3af"
          transform={`rotate(-35, ${xScale(i)}, ${H - 4})`}>
          {d.label.replace('年', '/').replace('月', '')}
        </text>
      ))}
      <text x={PAD.left - 4} y={PAD.top - 2} textAnchor="end" fontSize="7" fill="#9ca3af">kg</text>
      {pathD && (
        <path d={pathD} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round" />
      )}
      {data.map((d, i) => d.weight != null ? (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(d.weight)} r="3.5"
            fill="white" stroke="#0ea5e9" strokeWidth="1.8" />
          <text x={xScale(i)} y={yScale(d.weight) - 6} textAnchor="middle" fontSize="8" fill="#0369a1">
            {d.weight.toFixed(1)}
          </text>
        </g>
      ) : null)}
    </svg>
  )
}

// ── 傾向分析 ─────────────────────────────────────────────────────────
function TrendAnalysis({ monthlyData }: {
  monthlyData: { label: string; weight: number | null }[]
}) {
  const points = monthlyData.filter(m => m.weight != null) as { label: string; weight: number }[]
  if (points.length === 0) return null

  const latest = points[points.length - 1]
  const prev   = points.length >= 2 ? points[points.length - 2] : null
  const last3  = points.slice(-3)
  const last6  = points.slice(-6)
  const avg    = (arr: typeof points) => arr.reduce((s, m) => s + m.weight, 0) / arr.length

  const diff = prev != null ? latest.weight - prev.weight : null

  let trend = '安定'
  let trendColor = 'text-gray-600'
  if (last3.length >= 3) {
    const up   = last3[2].weight > last3[1].weight && last3[1].weight > last3[0].weight
    const down = last3[2].weight < last3[1].weight && last3[1].weight < last3[0].weight
    if (up)   { trend = '上昇傾向 ↑'; trendColor = 'text-rose-600' }
    if (down) { trend = '下降傾向 ↓'; trendColor = 'text-blue-600' }
  }

  const items = [
    { label: '直近体重', value: `${latest.weight.toFixed(1)} kg`, sub: latest.label },
    prev != null ? {
      label: '先月比',
      value: `${diff! >= 0 ? '+' : ''}${diff!.toFixed(1)} kg`,
      sub: `${prev.label} → ${latest.label}`,
      color: diff! > 0.5 ? 'text-rose-600' : diff! < -0.5 ? 'text-blue-600' : 'text-gray-700',
    } : null,
    last3.length >= 2 ? { label: '3ヶ月平均', value: `${avg(last3).toFixed(1)} kg` } : null,
    last6.length >= 4 ? { label: '6ヶ月平均', value: `${avg(last6).toFixed(1)} kg` } : null,
    { label: '傾向', value: trend, color: trendColor },
  ].filter(Boolean) as { label: string; value: string; sub?: string; color?: string }[]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(item => (
        <div key={item.label} className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-gray-400 mb-0.5">{item.label}</p>
          <p className={`text-sm font-bold ${item.color ?? 'text-gray-700'}`}>{item.value}</p>
          {item.sub && <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── メインコンポーネント ──────────────────────────────────────────────
export default function WeightClient({
  residents,
  selectedResidentId,
  selectedResident,
  weightRecords,
  today,
  measuredIds,
}: {
  residents: Resident[]
  selectedResidentId: string
  selectedResident: Resident | null
  weightRecords: { date: string; weight: number }[]
  today: string
  measuredIds: Set<string>
}) {
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)
  const [searchText, setSearchText]  = useState('')

  const saveWeightBound = selectedResidentId ? saveWeight.bind(null, selectedResidentId) : saveWeight.bind(null, '')
  const [formState, action, pending] = useActionState(saveWeightBound, null)

  // 50音フィルター
  const filteredResidents = residents.filter(r => {
    if (searchText) return r.name.includes(searchText) || (r.furigana ?? '').includes(searchText)
    if (gojuuonRow) {
      const char = (r.furigana ?? r.name)[0]
      const row  = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
      return row ? row.chars.includes(char) : true
    }
    return true
  })

  // 月次集計（直近12ヶ月）
  const monthlyData = useMemo(() => {
    const byMonth = new Map<string, number>()
    for (const r of weightRecords) {
      byMonth.set(r.date.slice(0, 7), r.weight)
    }
    const months: string[] = []
    const now = new Date(today)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months.map(ym => {
      const [y, m] = ym.split('-')
      return { ym, label: `${y}年${parseInt(m)}月`, weight: byMonth.get(ym) ?? null }
    })
  }, [weightRecords, today])

  function selectRow(label: string | null) {
    setGojuuonRow(label)
    setSearchText('')
  }

  const unmeasuredCount = residents.filter(r => !measuredIds.has(r.id)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">体重管理</h2>
        {unmeasuredCount > 0 && (
          <span className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-xs font-medium px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
            今月未測定 {unmeasuredCount}名
          </span>
        )}
        {unmeasuredCount === 0 && residents.length > 0 && (
          <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-medium px-3 py-1 rounded-full">
            ✓ 全員測定済み
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── 利用者リスト（左） ── */}
        <div className="lg:col-span-1 flex flex-col gap-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2">
            {/* 50音タブ */}
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => selectRow(null)}
                className={`text-xs px-2 py-0.5 rounded border font-medium transition ${
                  gojuuonRow === null && !searchText
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'
                }`}>全</button>
              {GOJUUON_ROWS.map(row => (
                <button type="button" key={row.label}
                  onClick={() => selectRow(gojuuonRow === row.label ? null : row.label)}
                  className={`text-xs px-2 py-0.5 rounded border transition ${
                    gojuuonRow === row.label
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400 hover:text-teal-600'
                  }`}>{row.label}</button>
              ))}
            </div>
            {/* テキスト検索 */}
            <input type="text" value={searchText}
              onChange={e => { setSearchText(e.target.value); setGojuuonRow(null) }}
              placeholder="名前で絞り込み..."
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
            <p className="text-[10px] text-gray-400">{filteredResidents.length}/{residents.length}名</p>
          </div>

          {/* 利用者ボタン一覧 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-h-[60vh] overflow-y-auto">
            {filteredResidents.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">該当なし</p>
            ) : (
              filteredResidents.map(r => {
                const unmeasured = !measuredIds.has(r.id)
                return (
                  <a key={r.id} href={`/weight?residentId=${r.id}`}
                    className={`flex items-center justify-between px-4 py-2.5 border-b last:border-0 transition text-sm ${
                      r.id === selectedResidentId
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span>{r.name}</span>
                      {r.furigana && <span className="text-[10px] text-gray-400 truncate">{r.furigana}</span>}
                    </span>
                    {unmeasured && (
                      <span className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                        未測定
                      </span>
                    )}
                  </a>
                )
              })
            )}
          </div>
        </div>

        {/* ── 右パネル ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {!selectedResident ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400 text-sm">
              左のリストから利用者を選択してください
            </div>
          ) : (
            <>
              {/* 体重入力フォーム */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">
                  {selectedResident.name} — 体重入力
                </h3>
                <form action={action} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">測定日</label>
                    <input type="date" name="date" defaultValue={today} required
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">体重（kg）</label>
                    <input type="number" name="weight" step="0.1" min="20" max="200"
                      placeholder="例: 62.5"
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <button type="submit" disabled={pending}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                    {pending ? '保存中...' : '保存'}
                  </button>
                  {formState?.error && (
                    <p className="text-xs text-red-600 w-full">{formState.error}</p>
                  )}
                  {formState?.success && (
                    <p className="text-xs text-emerald-600 w-full">✓ 保存しました</p>
                  )}
                </form>
              </div>

              {/* 月次推移グラフ */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 text-sm mb-3">月次推移（直近12ヶ月）</h3>
                <WeightChart data={monthlyData} />
              </div>

              {/* 傾向分析 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 text-sm mb-3">傾向分析</h3>
                {monthlyData.some(m => m.weight != null) ? (
                  <TrendAnalysis monthlyData={monthlyData} />
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">体重データがありません</p>
                )}
              </div>

              {/* 測定履歴 */}
              {weightRecords.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="font-semibold text-gray-700 text-sm mb-3">測定履歴</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b">
                          <th className="text-left py-1 pr-4">測定日</th>
                          <th className="text-right py-1">体重</th>
                          <th className="text-right py-1 pl-4">前回比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...weightRecords].reverse().map((r, i, arr) => {
                          const prev = arr[i + 1]
                          const diff = prev != null ? r.weight - prev.weight : null
                          return (
                            <tr key={r.date} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="py-1.5 pr-4 text-gray-600">{r.date}</td>
                              <td className="py-1.5 text-right font-medium text-gray-800">{r.weight.toFixed(1)} kg</td>
                              <td className={`py-1.5 text-right pl-4 font-medium ${
                                diff == null ? 'text-gray-400' :
                                diff > 0.5 ? 'text-rose-600' :
                                diff < -0.5 ? 'text-blue-600' : 'text-gray-500'
                              }`}>
                                {diff == null ? '-' : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kg`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
