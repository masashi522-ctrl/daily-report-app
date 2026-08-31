'use client'

import { useState } from 'react'
import { type ReportStats } from './actions'
import { generateAndSaveReport, saveReportBody } from './report-actions'
import PhotoGallery, { type ResidentPhoto } from './photo-gallery'
import type { WeightTrend } from '@/lib/analytics-view'

export interface ChartData {
  days: number[]
  bpSys: (number | null)[]
  bpDia: (number | null)[]
  pulse: (number | null)[]
  temp: (number | null)[]
  fluid: (number | null)[]
  meal: (number | null)[]
  weight: (number | null)[]
}

type ChartSeries = {
  values: (number | null)[]
  color: string
  label: string
  unit: string
  /** 平均・範囲を表示するときの小数点以下の桁数 */
  digits: number
}

/** グラフが描いている値そのものから、平均と最小〜最大を出して見出しに添える */
function SeriesSummary({ series, showLabel }: { series: ChartSeries[]; showLabel: boolean }) {
  return (
    <div className="flex items-baseline gap-4 flex-wrap">
      {series.map(s => {
        const vals = s.values.filter((v): v is number => v != null)
        if (vals.length === 0) return null
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        return (
          <span key={s.label} className="flex items-baseline gap-1.5 text-[11px] text-gray-500">
            <span className="inline-block w-4 h-0.5 rounded self-center" style={{ backgroundColor: s.color }} />
            {showLabel && <span>{s.label}</span>}
            <span className="text-base font-bold text-gray-800 tabular-nums">{avg.toFixed(s.digits)}</span>
            <span>{s.unit}</span>
            <span className="tabular-nums">（{Math.min(...vals).toFixed(s.digits)}〜{Math.max(...vals).toFixed(s.digits)}）</span>
          </span>
        )
      })}
    </div>
  )
}

function CardFrame({
  title,
  titleColor,
  month,
  series,
  children,
  periodLabel,
}: {
  title: string
  titleColor: string
  month: number
  series: ChartSeries[]
  children: React.ReactNode
  periodLabel?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2 border-b pb-2">
        <h3 className={`text-sm font-semibold ${titleColor}`}>
          {title} <span className="text-xs font-normal text-gray-400">{periodLabel ?? `${month}月推移`}</span>
        </h3>
        <SeriesSummary series={series} showLabel={series.length > 1} />
      </div>
      {children}
    </div>
  )
}

/**
 * 集計とグラフを1つの枠にまとめたカード。
 * 数値の表とグラフを別々に置くと縦に伸びて印刷時に分断されるため、
 * 平均と範囲を見出しに並べている。
 */
function ChartCard({
  title,
  titleColor,
  month,
  series,
  days,
  forcedMin,
  forcedMax,
  height,
  xTicks,
  periodLabel,
}: {
  title: string
  titleColor: string
  month: number
  series: ChartSeries[]
  days: number[]
  forcedMin?: number
  forcedMax?: number
  height?: number
  xTicks?: { index: number; label: string }[]
  periodLabel?: string
}) {
  return (
    <CardFrame title={title} titleColor={titleColor} month={month} series={series} periodLabel={periodLabel}>
      <SvgLineChart
        days={days}
        series={series}
        forcedMin={forcedMin}
        forcedMax={forcedMax}
        height={height}
        unit={series[0]?.unit ?? ''}
        xTicks={xTicks}
      />
    </CardFrame>
  )
}

/**
 * 単位も目盛りもまったく違う2項目を1枚にまとめるカード（食事量と水分摂取量）。
 * 1つのグラフに重ねると目盛りが噛み合わないため、横に並べてそれぞれの目盛りで描く。
 */
function SplitChartCard({
  title,
  titleColor,
  month,
  days,
  panels,
}: {
  title: string
  titleColor: string
  month: number
  days: number[]
  panels: { series: ChartSeries; forcedMin?: number; forcedMax?: number }[]
}) {
  return (
    <CardFrame title={title} titleColor={titleColor} month={month} series={panels.map(p => p.series)}>
      <div className="grid grid-cols-2 gap-4">
        {panels.map(panel => (
          <div key={panel.series.label}>
            <p className="text-[11px] text-gray-500 mb-0.5">{panel.series.label}</p>
            <SvgLineChart
              days={days}
              series={[panel.series]}
              forcedMin={panel.forcedMin}
              forcedMax={panel.forcedMax}
              height={90}
              unit={panel.series.unit}
            />
          </div>
        ))}
      </div>
    </CardFrame>
  )
}

// 目盛りの刻み幅の候補。体重のように変動が1kg程度の項目で10刻みにすると、
// 線がほぼ平らになって変化が読み取れなくなるため、データの幅に合わせて選ぶ。
const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]
function niceStep(raw: number) {
  return NICE_STEPS.find(s => s >= raw) ?? NICE_STEPS[NICE_STEPS.length - 1]
}

function SvgLineChart({
  days,
  series,
  forcedMin,
  forcedMax,
  height = 110,
  unit = '',
  xTicks,
}: {
  days: number[]
  series: { values: (number | null)[]; color: string; label: string }[]
  forcedMin?: number
  forcedMax?: number
  height?: number
  unit?: string
  /** 指定すると、日付ではなくこの目盛りを横軸に出す */
  xTicks?: { index: number; label: string }[]
}) {
  const W = 560
  const H = height
  const PAD = { top: 10, right: 12, bottom: 22, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const n = days.length

  const allVals = series.flatMap(s => s.values).filter((v): v is number => v != null)
  if (allVals.length === 0) {
    return <div className="flex items-center justify-center text-xs text-gray-400 py-6">データなし</div>
  }

  const rawMin = Math.min(...allVals)
  const rawMax = Math.max(...allVals)
  // 実際の幅に少し余白を足し、読みやすい刻みに丸める
  const spread = (rawMax - rawMin) || Math.max(Math.abs(rawMax) * 0.1, 1)
  const step = niceStep((spread * 1.3) / 4)
  const dataMin = forcedMin ?? Math.floor((rawMin - spread * 0.15) / step) * step
  const dataMax = forcedMax ?? Math.ceil((rawMax + spread * 0.15) / step) * step
  const dataRange = dataMax === dataMin ? 1 : dataMax - dataMin

  const xScale = (i: number) => PAD.left + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW)
  const yScale = (v: number) => PAD.top + (1 - (v - dataMin) / dataRange) * chartH

  const gridCount = 4
  const gridVals = Array.from({ length: gridCount + 1 }, (_, i) => dataMin + (i / gridCount) * dataRange)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${height}px` }}>
      {gridVals.map((v, gi) => {
        const y = yScale(v)
        return (
          <g key={gi}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.left - 3} y={y + 3.5} textAnchor="end" fontSize="8" fill="#9ca3af">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        )
      })}
      {xTicks
        ? xTicks.map(t => (
            <text key={t.label} x={xScale(t.index)} y={H - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">{t.label}</text>
          ))
        : days.map((d, i) => (d === 1 || d % 5 === 0) && (
            <text key={d} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">{d}</text>
          ))}
      {/* unit label */}
      {unit && <text x={PAD.left - 3} y={PAD.top - 2} textAnchor="end" fontSize="7" fill="#9ca3af">{unit}</text>}
      {series.map(s => {
        let d = ''
        s.values.forEach((v, i) => {
          if (v == null) return
          const x = xScale(i)
          const y = yScale(v)
          d += d === '' ? `M ${x} ${y}` : ` L ${x} ${y}`
        })
        return d ? (
          <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" />
        ) : null
      })}
      {series.map(s =>
        s.values.map((v, i) => v != null ? (
          <circle key={`${s.label}-${i}`} cx={xScale(i)} cy={yScale(v)} r="2.5" fill="white" stroke={s.color} strokeWidth="1.5" />
        ) : null)
      )}
    </svg>
  )
}

export default function ResidentReport({
  stats,
  chartData,
  residentId,
  year,
  month,
  photos,
  savedReport,
  weightTrend,
}: {
  stats: ReportStats
  chartData: ChartData
  residentId: string
  year: number
  month: number
  photos: ResidentPhoto[]
  savedReport: string
  /** 体重は当月だけでは傾向が読めないため、前々月からの3か月分を受け取る */
  weightTrend: WeightTrend
}) {
  // 保存済みの報告書があれば、開いた時点で表示する（作り直さなくても印刷・出力できる）
  const [report, setReport] = useState(savedReport)
  const [generating, setGenerating] = useState(false)
  // 生成した本文はそのまま印刷・保存されるため、職員が手直しできるようにする
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [forceDetailed, setForceDetailed] = useState(false)
  // 現場の記録がある月は、チェックしなくてもその内容は詳しく報告される
  const hasRecords = stats.careNotes.length > 0 || stats.serviceGaps.length > 0
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'word' | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setReport('')
    try {
      const result = await generateAndSaveReport(residentId, year, month, forceDetailed)
      if (result.status === 'ok') setReport(result.body)
      else if (result.status === 'wait') setReport(`【生成エラー】1分あたりの利用上限に達しました。約${result.seconds}秒おいてから、もう一度お試しください。`)
      else if (result.status === 'limit') setReport(`【生成エラー】${result.message}。無料枠は1日あたりのトークン数にも上限があります。時間をおいてから、または日を改めてお試しください。`)
      else if (result.status === 'skip') setReport(`【記録なし】${result.message}`)
      else setReport(`【生成エラー】${result.message}`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setReport(`【エラー】${detail}`)
    } finally {
      setGenerating(false)
    }
  }

  function startEditing() {
    setDraft(report)
    setSaveError('')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const ok = await saveReportBody(residentId, year, month, draft)
      if (!ok) {
        setSaveError('保存できませんでした。時間をおいてもう一度お試しください。')
        return
      }
      setReport(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleReportDownload(format: 'pdf' | 'word') {
    setDownloadingFormat(format)
    try {
      const res = await fetch('/api/analytics/care-report-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          reportText: report,
          residentName: stats.residentName,
          year: stats.year,
          month: stats.month,
          dailyNotes: stats.dailyNotes,
          photoUrls: photos.map(p => p.url),
        }),
      })
      if (!res.ok) throw new Error('ダウンロードに失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `月次報告書_${stats.residentName}_${stats.year}年${stats.month}月.${format === 'pdf' ? 'pdf' : 'docx'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setDownloadingFormat(null)
    }
  }

  const hasBp   = chartData.bpSys.some(v => v != null)
  const hasPulse = chartData.pulse.some(v => v != null)
  const hasTemp = chartData.temp.some(v => v != null)
  const hasMeal = chartData.meal.some(v => v != null)
  const hasFluid = chartData.fluid.some(v => v != null)

  return (
    <div className="flex flex-col gap-4 mt-2">
      {/* Charts */}
      {(hasBp || hasPulse) && (
        <ChartCard title="血圧・脈拍" titleColor="text-rose-700" month={month}
          series={[
            ...(hasBp ? [
              { values: chartData.bpSys, color: '#ef4444', label: '収縮期', unit: 'mmHg', digits: 0 },
              { values: chartData.bpDia, color: '#fb923c', label: '拡張期', unit: 'mmHg', digits: 0 },
            ] : []),
            ...(hasPulse ? [
              { values: chartData.pulse, color: '#8b5cf6', label: '脈拍', unit: '回/分', digits: 0 },
            ] : []),
          ]}
          days={chartData.days}
        />
      )}
      {hasTemp && (
        <ChartCard title="体温" titleColor="text-blue-700" month={month}
          series={[{ values: chartData.temp, color: '#3b82f6', label: '体温', unit: '℃', digits: 1 }]}
          days={chartData.days}
          forcedMin={35} forcedMax={38.5} height={90}
        />
      )}
      {(hasMeal || hasFluid) && (
        <SplitChartCard title="食事量・水分摂取量" titleColor="text-amber-700" month={month} days={chartData.days}
          panels={[
            ...(hasMeal ? [{
              series: { values: chartData.meal, color: '#f59e0b', label: '食事量', unit: '割', digits: 1 },
              forcedMin: 0, forcedMax: 10,
            }] : []),
            ...(hasFluid ? [{
              series: { values: chartData.fluid, color: '#0ea5e9', label: '水分摂取量', unit: 'ml', digits: 0 },
              forcedMin: 0,
            }] : []),
          ]}
        />
      )}
      {weightTrend.months.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2 border-b pb-2">
            <h3 className="text-sm font-semibold text-teal-700">
              体重 <span className="text-xs font-normal text-gray-400">3か月の推移</span>
            </h3>
            {weightTrend.change != null && (
              <span className="text-[11px] text-gray-500">
                {weightTrend.months[0].label}から
                <span className={`ml-1 text-base font-bold tabular-nums ${
                  weightTrend.change > 0 ? 'text-orange-600' : weightTrend.change < 0 ? 'text-blue-600' : 'text-gray-700'
                }`}>
                  {weightTrend.change > 0 ? '+' : ''}{weightTrend.change.toFixed(1)}
                </span>
                <span className="ml-0.5">kg</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {weightTrend.months.map(m => (
              <div key={m.label} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                <p className="text-xs text-gray-500">{m.label}</p>
                <p className="text-xl font-bold text-gray-800 tabular-nums">
                  {m.avg.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-1">kg</span>
                </p>
                <p className="text-[10px] text-gray-400 tabular-nums">
                  {m.min === m.max ? `${m.count}回測定` : `${m.min.toFixed(1)}〜${m.max.toFixed(1)} / ${m.count}回`}
                </p>
              </div>
            ))}
          </div>
          {weightTrend.points.length >= 2 && (
            <SvgLineChart
              days={weightTrend.points.map((_, i) => i)}
              series={[{ values: weightTrend.points, color: '#0d9488', label: '体重' }]}
              xTicks={weightTrend.ticks}
              height={90}
              unit="kg"
            />
          )}
        </div>
      )}

      {/* 当月の特記事項 */}
      {stats.dailyNotes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            当月の特記事項
            <span className="ml-2 text-xs font-normal text-gray-400">{stats.dailyNotes.length}件</span>
          </h3>
          <div className="flex flex-col gap-2">
            {stats.dailyNotes.map((note, i) => {
              const d = note.date.split('-')
              return (
                <div key={`${note.date}-${i}`} className="flex gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs font-medium text-gray-500 shrink-0 w-16">
                    {parseInt(d[1])}月{parseInt(d[2])}日
                  </span>
                  <span className="text-sm text-gray-700 whitespace-pre-wrap">{note.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 写真（最大5枚） */}
      <div className="print:hidden">
        <PhotoGallery residentId={residentId} year={year} month={month} photos={photos} />
      </div>
      {photos.length > 0 && (
        <div className="hidden print:block print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">今月の様子（写真）</h3>
          <div className="grid print:grid-cols-3 gap-2">
            {photos.map(photo => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt="" className="w-full aspect-square object-cover rounded" />
            ))}
          </div>
        </div>
      )}

      {/* AI Report */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {/* 画面では何の報告書か分かるように、印刷物ではケアマネジャーにお渡しする体裁で「月次報告書」と出す */}
            <span className="print:hidden">ケアマネジャー向け月次報告書</span>
            <span className="hidden print:inline">月次報告書</span>
            {/* 画面上の目印。ケアマネジャーへお渡しする印刷物には出さない */}
            <span className="ml-2 text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded print:hidden">AI生成</span>
          </h3>
          <div className="flex gap-2 flex-wrap print:hidden">
            {report && !editing && (
              <button onClick={startEditing}
                className="text-xs px-3 py-1.5 rounded-lg border font-medium transition bg-white text-gray-600 border-gray-200 hover:border-gray-400">
                編集
              </button>
            )}
            {editing && (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-300">
                  {saving ? '保存中…' : '保存'}
                </button>
                <button onClick={() => setEditing(false)} disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium transition bg-white text-gray-600 border-gray-200 hover:border-gray-400">
                  取り消し
                </button>
              </>
            )}
            {report && (
              <button
                onClick={() => handleReportDownload('pdf')}
                disabled={downloadingFormat !== null}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition inline-flex items-center gap-1 ${
                  downloadingFormat !== null
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingFormat === 'pdf' ? 'PDF生成中...' : 'PDF ダウンロード'}
              </button>
            )}
            {report && (
              <button
                onClick={() => handleReportDownload('word')}
                disabled={downloadingFormat !== null}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition inline-flex items-center gap-1 ${
                  downloadingFormat !== null
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingFormat === 'word' ? 'Word生成中...' : 'Word ダウンロード'}
              </button>
            )}
            <button onClick={handleGenerate} disabled={generating}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                generating
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              {generating ? '生成中...' : report ? '再生成' : 'レポート生成'}
            </button>
          </div>
        </div>
        <div className="mb-3 print:hidden">
          <label className="flex items-center gap-1.5 cursor-pointer select-none w-fit">
            <input type="checkbox" checked={forceDetailed} onChange={e => setForceDetailed(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-xs text-gray-600">
              加算対象・ケアプラン更新月・状態に変化があった方 — 詳しく報告する
            </span>
          </label>
          <p className="text-[10px] text-gray-400 mt-1 ml-5">
            {forceDetailed
              ? '各見出しを4〜6文に増やし、月前半と後半での様子の違いやご本人の表情・お言葉まで詳しくお伝えします。'
              : hasRecords
              ? '今月は現場の記録があるため、チェックしなくてもその内容は詳しく報告されます。'
              : '通常の分量で作成します。'}
          </p>
        </div>
        {editing ? (
          <div className="print:hidden">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={16}
              className="w-full bg-white rounded-lg p-4 text-sm text-gray-700 leading-relaxed border border-teal-300 focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              段落は空行で区切ってください。保存すると、この内容が印刷・PDF・Word出力に使われます。
            </p>
            {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
          </div>
        ) : report ? (
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-slate-100">
            {report}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-8">
            「レポート生成」を押すと、月次データをもとにAIがケアマネジャー向け報告書を自動作成します。
          </p>
        )}
      </div>

    </div>
  )
}
