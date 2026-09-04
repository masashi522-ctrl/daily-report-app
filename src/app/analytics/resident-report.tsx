'use client'

import { useState } from 'react'
import { type ReportStats } from './actions'
import { generateAndSaveReport, saveReportBody } from './report-actions'
import PhotoGallery, { type ResidentPhoto } from './photo-gallery'
import type { DailyRow } from '@/lib/analytics-view'

export interface ChartData {
  days: number[]
  bpSys: (number | null)[]
  bpDia: (number | null)[]
  pulse: (number | null)[]
  temp: (number | null)[]
  spo2: (number | null)[]
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
          <span key={s.label} className="flex items-baseline gap-1.5 text-[11px] text-gray-900">
            <span className="inline-block w-4 h-0.5 rounded self-center" style={{ backgroundColor: s.color }} />
            {showLabel && <span>{s.label}</span>}
            <span className="text-base font-bold text-gray-900 tabular-nums">{avg.toFixed(s.digits)}</span>
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
}: {
  title: string
  titleColor: string
  month: number
  series: ChartSeries[]
  children: React.ReactNode
}) {
  return (
    <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2 border-b pb-2">
        <h3 className={`text-sm font-semibold ${titleColor}`}>
          {title} <span className="text-xs font-normal text-gray-700">{`${month}月推移`}</span>
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
}: {
  title: string
  titleColor: string
  month: number
  series: ChartSeries[]
  days: number[]
  forcedMin?: number
  forcedMax?: number
  height?: number
}) {
  return (
    <CardFrame title={title} titleColor={titleColor} month={month} series={series}>
      <SvgLineChart
        days={days}
        series={series}
        forcedMin={forcedMin}
        forcedMax={forcedMax}
        height={height}
        unit={series[0]?.unit ?? ''}
      />
    </CardFrame>
  )
}

/**
 * 報告書の本文を【見出し】ごとに分ける。
 * 本文は「活動の様子」と「機能訓練の様子」の2項目で作られるが、
 * 見出しを付ける前に作った報告書や生成エラーの文言もそのまま出せるようにしている。
 */
function splitReportSections(text: string) {
  return text
    .split(/(?=【[^】]+】)/)
    .map(part => {
      const matched = part.match(/^【([^】]+)】\s*([\s\S]*)$/)
      return matched
        ? { header: matched[1], body: matched[2].trim() }
        : { header: '', body: part.trim() }
    })
    .filter(section => section.header || section.body)
}

/** 日ごとの値から平均と最小〜最大を出す。記録が1つも無ければ null */
function summarize(values: (number | null)[], digits: number) {
  const vals = values.filter((v): v is number => v != null)
  if (vals.length === 0) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return {
    avg: avg.toFixed(digits),
    min: Math.min(...vals).toFixed(digits),
    max: Math.max(...vals).toFixed(digits),
    count: vals.length,
  }
}

function SummaryTile({
  label,
  value,
  unit,
  sub,
  alert = false,
}: {
  label: string
  value: string
  unit: string
  sub?: React.ReactNode
  /** 目を留めていただきたい項目（特記事項）を赤字にする */
  alert?: boolean
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className={`text-[11px] ${alert ? 'text-red-600' : 'text-gray-900'}`}>{label}</p>
      <p className={`text-lg font-bold tabular-nums leading-tight ${alert ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
        <span className={`text-[11px] font-normal ml-1 ${alert ? 'text-red-600' : 'text-gray-700'}`}>{unit}</span>
      </p>
      {sub && <p className="text-[11px] text-gray-700 tabular-nums leading-tight mt-0.5">{sub}</p>}
    </div>
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
    return <div className="flex items-center justify-center text-xs text-gray-700 py-6">データなし</div>
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
            <text x={PAD.left - 3} y={y + 3.5} textAnchor="end" fontSize="9" fill="#4b5563">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        )
      })}
      {days.map((d, i) => (d === 1 || d % 5 === 0) && (
        <text key={d} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#4b5563">{d}</text>
      ))}
      {/* unit label */}
      {unit && <text x={PAD.left - 3} y={PAD.top - 2} textAnchor="end" fontSize="7" fill="#4b5563">{unit}</text>}
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
  dailyRows,
}: {
  stats: ReportStats
  chartData: ChartData
  residentId: string
  year: number
  month: number
  photos: ResidentPhoto[]
  savedReport: string
  /** 日別記録の表に出す行。ご利用のあった日を日付順に並べたもの */
  dailyRows: DailyRow[]
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

  // 当月の概要。血圧・脈拍・体温は下のグラフと同じ日別データから出しているため、
  // グラフの見出しに並ぶ平均と必ず一致する
  const bpSys = summarize(chartData.bpSys, 0)
  const bpDia = summarize(chartData.bpDia, 0)
  const pulse = summarize(chartData.pulse, 0)
  const temp = summarize(chartData.temp, 1)
  const spo2 = summarize(chartData.spo2, 1)
  const fluid = summarize(chartData.fluid, 0)
  const weight = summarize(chartData.weight, 1)

  // 概要は主要な数値だけを並べる。範囲や内訳などの補足は、
  // 枠が狭いと折り返して読みにくくなるため出していない
  const summaryTiles: { label: string; value: string; unit: string; alert?: boolean }[] = []
  summaryTiles.push({ label: '利用日数', value: String(stats.attendanceCount), unit: '日' })
  summaryTiles.push({ label: '欠席', value: String(stats.absentCount), unit: '日' })
  if (bpSys || bpDia) {
    summaryTiles.push({
      label: '血圧',
      value: bpSys && bpDia ? `${bpSys.avg}/${bpDia.avg}` : (bpSys ?? bpDia)!.avg,
      unit: 'mmHg',
    })
  }
  if (pulse) {
    summaryTiles.push({ label: '脈拍', value: pulse.avg, unit: '回/分' })
  }
  if (temp) {
    summaryTiles.push({ label: '体温', value: temp.avg, unit: '℃' })
  }
  if (spo2) {
    summaryTiles.push({ label: 'SpO2', value: spo2.avg, unit: '%' })
  }
  if (stats.mealMainAvg != null || stats.mealSideAvg != null) {
    summaryTiles.push({
      label: '食事量',
      value: `${stats.mealMainAvg?.toFixed(1) ?? '-'}/${stats.mealSideAvg?.toFixed(1) ?? '-'}`,
      unit: '割',
    })
  }
  if (fluid) {
    summaryTiles.push({ label: '水分', value: fluid.avg, unit: 'ml' })
  }
  if (weight) {
    summaryTiles.push({ label: '体重', value: weight.avg, unit: 'kg' })
  }
  summaryTiles.push({ label: '入浴', value: String(stats.bathingCount), unit: '回' })
  summaryTiles.push({ label: '機能訓練', value: String(stats.trainingCount), unit: '回' })
  // 特記事項は目を留めていただきたい項目なので、件数の有無にかかわらず赤字で出す
  summaryTiles.push({ label: '特記事項', value: String(stats.dailyNotes.length), unit: '件', alert: true })

  // 概要は印刷時に必ず2段で収める。項目は記録の有無で増減するため、列数は件数から決める
  const summaryCols = Math.max(1, Math.ceil(summaryTiles.length / 2))

  return (
    <div className="report-body flex flex-col gap-4 mt-2">
      <style>{`
        /* 概要は2段で収める。項目数は人によって変わるため、列数は件数の半分にしている。
           幅の足りない画面では折り返しても読めるよう、広い画面と印刷のときだけ適用する */
        @media print, (min-width: 1024px) {
          .summary-tiles { grid-template-columns: repeat(var(--summary-cols), minmax(0, 1fr)) !important; }
        }
        /* 週2回ほどのご利用の方がA4両面1枚（2ページ）に収まるよう、印刷では余白を詰める。
           まとめて印刷のページ数計測（.measuring）は画面上で行うため、同じ指定を効かせる */
        @media print {
          .report-body { gap: 0.5rem !important; margin-top: 0 !important; }
          .report-card { padding: 0.5rem 0.625rem !important; box-shadow: none !important; }
          .report-card h3 { margin-bottom: 0.375rem !important; padding-bottom: 0.25rem !important; }
          .report-section { padding: 0.5rem 0.625rem !important; }
          .summary-tiles { gap: 0.25rem !important; }
          .summary-tiles > div { padding: 0.125rem 0.5rem !important; }
          .daily-table th, .daily-table td { padding-top: 0.0625rem !important; padding-bottom: 0.0625rem !important; }
        }
        .measuring .summary-tiles { grid-template-columns: repeat(var(--summary-cols), minmax(0, 1fr)) !important; }
        .measuring .report-body { gap: 0.5rem !important; margin-top: 0 !important; }
        .measuring .report-card { padding: 0.5rem 0.625rem !important; box-shadow: none !important; }
        .measuring .report-card h3 { margin-bottom: 0.375rem !important; padding-bottom: 0.25rem !important; }
        .measuring .report-section { padding: 0.5rem 0.625rem !important; }
        .measuring .summary-tiles { gap: 0.25rem !important; }
        .measuring .summary-tiles > div { padding: 0.125rem 0.5rem !important; }
        .measuring .daily-table th, .measuring .daily-table td { padding-top: 0.0625rem !important; padding-bottom: 0.0625rem !important; }
      `}</style>
      {/* 当月の概要。報告書のいちばん最初に、その月の数字をまとめて置く */}
      <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-2">
          当月の概要 <span className="text-xs font-normal text-gray-700">{year}年{month}月</span>
        </h3>
        <div
          className="summary-tiles grid grid-cols-2 sm:grid-cols-3 gap-2"
          style={{ '--summary-cols': summaryCols } as React.CSSProperties}
        >
          {summaryTiles.map(tile => (
            <SummaryTile key={tile.label} {...tile} />
          ))}
        </div>
      </div>

      {/* ゴールのイメージ。介護計画書に書かれているものをそのまま載せ、報告書の前提を示す */}
      {stats.carePlan?.goalImage?.trim() && (
        <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 border-b pb-2">
            ゴールのイメージ
            <span className="ml-2 text-xs font-normal text-gray-700">介護計画書より</span>
          </h3>
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
            {stats.carePlan.goalImage.trim()}
          </p>
        </div>
      )}

      {/* 月次報告書（AI生成）。特記事項→日別記録→グラフ→写真と続く並びは、
          これまで使っていた月間報告書と同じ順序にそろえている。
          印刷では本文の途中で改ページできるようにしている。枠ごと次のページへ送ると、
          手前のページが大きく空いてしまうため（見出しだけが行末に残らないよう break-after は禁じている） */}
      <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2 print:break-after-avoid">
          <h3 className="text-sm font-semibold text-gray-900">
            {/* 画面ではどの報告書かが分かるように、印刷物では書類の見出しとして「当月の様子」と出す
                （書類全体の題名は「月間報告書」で、上部に別途印刷される） */}
            <span className="print:hidden">ケアマネジャー向け月次報告書</span>
            <span className="hidden print:inline">当月の様子</span>
            {/* 画面上の目印。ケアマネジャーへお渡しする印刷物には出さない */}
            <span className="ml-2 text-[11px] font-normal text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded print:hidden">AI生成</span>
          </h3>
          <div className="flex gap-2 flex-wrap print:hidden">
            {report && !editing && (
              <button onClick={startEditing}
                className="text-xs px-3 py-1.5 rounded-lg border font-medium transition bg-white text-gray-700 border-gray-200 hover:border-gray-400">
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
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium transition bg-white text-gray-700 border-gray-200 hover:border-gray-400">
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
                    ? 'bg-gray-100 text-gray-700 border-gray-200 cursor-not-allowed'
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
                    ? 'bg-gray-100 text-gray-700 border-gray-200 cursor-not-allowed'
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
                  ? 'bg-gray-100 text-gray-700 cursor-not-allowed'
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
            <span className="text-xs text-gray-700">
              加算対象・ケアプラン更新月・状態に変化があった方 — 詳しく報告する
            </span>
          </label>
          <p className="text-[11px] text-gray-700 mt-1 ml-5">
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
              className="w-full bg-white rounded-lg p-4 text-sm text-gray-900 leading-relaxed border border-teal-300 focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-gray-700 mt-1">
              段落は空行で区切ってください。【活動の様子】【機能訓練の様子】の見出しはそのまま残してください。
              保存すると、この内容が印刷・PDF・Word出力に使われます。
            </p>
            {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
          </div>
        ) : report ? (
          <div className="flex flex-col gap-3">
            {/* 「活動の様子」と「機能訓練の様子」は、ケアマネジャーが読み分けられるよう別々の枠に入れる */}
            {splitReportSections(report).map((section, i) => (
              <div
                key={`${section.header}-${i}`}
                className="report-section rounded-lg border border-gray-200 bg-slate-50 p-4"
              >
                {section.header && (
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 pb-1.5 border-b border-gray-200 print:break-after-avoid">
                    {section.header}
                  </h4>
                )}
                <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-700 text-center py-8">
            「レポート生成」を押すと、月次データをもとにAIがケアマネジャー向け報告書を自動作成します。
            本文は「活動の様子」と「機能訓練の様子」の2項目に分かれます。
          </p>
        )}
      </div>

      {/* 当月の特記事項。件数が多い月は1ページに収まらないため、カードごと次のページへ送らず、
          途中で改ページできるようにしている（1件ずつは下で分けないようにしている） */}
      {stats.dailyNotes.length > 0 && (
        <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-red-600 mb-3 print:break-after-avoid">
            当月の特記事項
            <span className="ml-2 text-xs font-normal text-red-600">{stats.dailyNotes.length}件</span>
          </h3>
          <div className="flex flex-col gap-2">
            {stats.dailyNotes.map((note, i) => {
              const d = note.date.split('-')
              return (
                <div key={`${note.date}-${i}`} className="flex gap-3 bg-gray-50 rounded-lg px-3 py-2 print:break-inside-avoid">
                  <span className="text-xs font-medium text-red-600 shrink-0 w-16">
                    {parseInt(d[1])}月{parseInt(d[2])}日
                  </span>
                  <span className="text-sm text-gray-900 whitespace-pre-wrap">{note.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 日別記録。平均だけでは分からない日ごとの実施状況を、1か月分そのまま載せる */}
      {dailyRows.length > 0 && (
        <div className="report-card bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-2 print:break-after-avoid">
            日別記録
            <span className="ml-2 text-xs font-normal text-gray-700">{month}月</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="daily-table w-full text-xs tabular-nums text-gray-900">
              <thead>
                <tr className="text-gray-900 border-b border-gray-200">
                  <th className="text-left font-medium py-1.5 pr-2 whitespace-nowrap">日付</th>
                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">主食</th>
                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">主菜</th>
                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">水分</th>
                  <th className="text-left font-medium py-1.5 px-2 whitespace-nowrap">排便</th>
                  <th className="text-center font-medium py-1.5 px-2 whitespace-nowrap">服薬</th>
                  <th className="text-center font-medium py-1.5 px-2 whitespace-nowrap">口腔ケア</th>
                  <th className="text-center font-medium py-1.5 px-2 whitespace-nowrap">入浴</th>
                  <th className="text-center font-medium py-1.5 px-2 whitespace-nowrap">機能訓練</th>
                  <th className="text-right font-medium py-1.5 px-2 whitespace-nowrap">体重</th>
                  <th className="text-center font-medium py-1.5 pl-2 whitespace-nowrap text-red-600">特記</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map(row => (
                  <tr key={row.date} className="border-b border-gray-100 last:border-0 print:break-inside-avoid">
                    <td className="py-1 pr-2 whitespace-nowrap text-gray-700">
                      {row.day}日（{row.weekday}）
                    </td>
                    {row.isAbsent ? (
                      <td className="py-1 px-2 text-gray-700" colSpan={9}>
                        欠席{row.absenceReason ? `：${row.absenceReason}` : ''}
                      </td>
                    ) : (
                      <>
                        <td className="text-right py-1 px-2">{row.mealMain ?? '-'}</td>
                        <td className="text-right py-1 px-2">{row.mealSide ?? '-'}</td>
                        <td className="text-right py-1 px-2">{row.fluid ?? '-'}</td>
                        <td className="py-1 px-2 whitespace-nowrap">{row.bowel ?? '—'}</td>
                        <td className="text-center py-1 px-2 whitespace-nowrap">{row.medication ?? '—'}</td>
                        <td className="text-center py-1 px-2">{row.oralCare ? '○' : '—'}</td>
                        <td className="text-center py-1 px-2">
                          {row.bathing === 'DONE' ? '○' : row.bathing === 'NOT_DONE' ? '×' : '—'}
                        </td>
                        <td className="text-center py-1 px-2">{row.training ? '○' : '—'}</td>
                        <td className="text-right py-1 px-2">{row.weight != null ? row.weight.toFixed(1) : '—'}</td>
                      </>
                    )}
                    <td className="text-center py-1 pl-2 text-rose-500">{row.hasNote ? '★' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-700 mt-2">
            主食・主菜は割、水分はml、体重はkg。★はその日に特記事項の記録があることを示します。
          </p>
        </div>
      )}

      {/* Charts。血圧・脈拍と体温は続けて見るものなので、印刷では2つでひとまとまりに扱い、
          体温のグラフだけが次のページに取り残されないようにしている */}
      {(hasBp || hasPulse || hasTemp) && (
      <div className="flex flex-col gap-4 print:break-inside-avoid">
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
      </div>
      )}
      {/* 食事量・水分摂取量・体重は、グラフをやめて当月の概要に数値でまとめている */}

      {/* 写真（最大5枚） */}
      <div className="print:hidden">
        <PhotoGallery residentId={residentId} year={year} month={month} photos={photos} />
      </div>
      {photos.length > 0 && (
        <div className="hidden print:block print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">今月の様子（写真）</h3>
          <div className="grid print:grid-cols-3 gap-2">
            {photos.map(photo => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt="" className="w-full aspect-square object-cover rounded" />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
