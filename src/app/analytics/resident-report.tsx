'use client'

import { useState } from 'react'
import { generateCareReport, type ReportStats } from './actions'

export interface ChartData {
  days: number[]
  bpSys: (number | null)[]
  bpDia: (number | null)[]
  temp: (number | null)[]
  fluid: (number | null)[]
  meal: (number | null)[]
  weight: (number | null)[]
}

function SvgLineChart({
  days,
  series,
  forcedMin,
  forcedMax,
  height = 110,
  unit = '',
}: {
  days: number[]
  series: { values: (number | null)[]; color: string; label: string }[]
  forcedMin?: number
  forcedMax?: number
  height?: number
  unit?: string
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
  const dataMin = forcedMin ?? Math.floor(rawMin / 10) * 10
  const dataMax = forcedMax ?? Math.ceil(rawMax / 10) * 10
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
      {days.map((d, i) => (d === 1 || d % 5 === 0) && (
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
}: {
  stats: ReportStats
  chartData: ChartData
  residentId: string
  year: number
  month: number
}) {
  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    setReport('')
    try {
      const text = await generateCareReport(stats)
      setReport(text)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setReport(`【エラー】${detail}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleWordDownload() {
    setDownloading(true)
    try {
      const res = await fetch('/api/analytics/word-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportText: report,
          residentName: stats.residentName,
          year: stats.year,
          month: stats.month,
        }),
      })
      if (!res.ok) throw new Error('ダウンロードに失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `月次報告書_${stats.residentName}_${stats.year}年${stats.month}月.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setDownloading(false)
    }
  }

  const hasBp   = chartData.bpSys.some(v => v != null)
  const hasTemp = chartData.temp.some(v => v != null)
  const hasFluid = chartData.fluid.some(v => v != null)
  const hasWeight = chartData.weight.some(v => v != null)

  return (
    <div className="flex flex-col gap-4 mt-2">
      {/* Charts */}
      {hasBp && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-sm font-semibold text-rose-700">血圧推移（mmHg）</h3>
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="inline-block w-5 h-0.5 bg-red-500 rounded"></span>収縮期
            </span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="inline-block w-5 h-0.5 bg-orange-400 rounded"></span>拡張期
            </span>
          </div>
          <SvgLineChart
            days={chartData.days}
            series={[
              { values: chartData.bpSys, color: '#ef4444', label: '収縮期' },
              { values: chartData.bpDia, color: '#fb923c', label: '拡張期' },
            ]}
            unit="mmHg"
          />
        </div>
      )}
      {hasTemp && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-blue-700 mb-2">体温推移（℃）</h3>
          <SvgLineChart
            days={chartData.days}
            series={[{ values: chartData.temp, color: '#3b82f6', label: '体温' }]}
            forcedMin={35}
            forcedMax={38.5}
            height={90}
            unit="℃"
          />
        </div>
      )}
      {hasFluid && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-sky-700 mb-2">水分摂取量推移（ml）</h3>
          <SvgLineChart
            days={chartData.days}
            series={[{ values: chartData.fluid, color: '#0ea5e9', label: '水分' }]}
            forcedMin={0}
            height={90}
            unit="ml"
          />
        </div>
      )}
      {hasWeight && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-teal-700 mb-2">体重推移（kg）</h3>
          <SvgLineChart
            days={chartData.days}
            series={[{ values: chartData.weight, color: '#0d9488', label: '体重' }]}
            height={90}
            unit="kg"
          />
        </div>
      )}

      {/* AI Report */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            ケアマネジャー向け月次報告書
            <span className="ml-2 text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">AI生成</span>
          </h3>
          <div className="flex gap-2 flex-wrap">
            {report && (
              <button onClick={handleCopy}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                  copied
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}>
                {copied ? '✓ コピー済み' : 'コピー'}
              </button>
            )}
            <button
              onClick={handleWordDownload}
              disabled={!report || downloading}
              title={!report ? 'レポートを生成してからダウンロードできます' : ''}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition inline-flex items-center gap-1 ${
                !report || downloading
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? 'Word生成中...' : 'Word ダウンロード'}
            </button>
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
        {report ? (
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-slate-100">
            {report}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-8">
            「レポート生成」を押すと、月次データをもとにAIがケアマネジャー向け報告書を自動作成します。
          </p>
        )}
      </div>

      {/* Excel Download */}
      <div className="flex justify-end">
        <a
          href={`/api/analytics/export?year=${year}&month=${month}&residentId=${residentId}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition font-medium"
          download
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Excelダウンロード（{stats.residentName}）
        </a>
      </div>
    </div>
  )
}
