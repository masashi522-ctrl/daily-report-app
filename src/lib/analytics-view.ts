// 利用者月次報告の画面表示に使う値の組み立て。
// 個別の画面と「まとめて印刷」の両方から使うため、画面から切り出している。
// ここを直せば両方の見た目が同時に変わる。

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase'

type Rec = any

const PHOTO_BUCKET = 'resident-monthly-photos'

function avg(arr: (number | null | undefined)[]) {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-'
}
function avgCombined(a: (number | null | undefined)[], b: (number | null | undefined)[]) {
  return avg([...a, ...b])
}

// グラフを持たない項目。今はすべての項目がグラフ側に平均を出しているため空だが、
// グラフの無い項目を足したときにここへ入れれば、利用者を選んだ画面と印刷にカードとして出る。
export const CARDS_WITHOUT_CHART: string[] = []

export interface VitalCard {
  title: string
  unit: string
  rows: { label: string; value: string; highlight: boolean }[]
}

/** バイタル系のカード（血圧・脈拍・体温・水分・食事・体重） */
export function buildVitalCards(records: Rec[], month: number): VitalCard[] {
  const r = records
  const label = `${month}月推移`
  return [
    { title: '血圧（収縮期）', unit: 'mmHg', rows: [{ label, value: avgCombined(r.map(x => x.bpSystolic), r.map(x => x.bpSystolicPm)), highlight: true }] },
    { title: '血圧（拡張期）', unit: 'mmHg', rows: [{ label, value: avgCombined(r.map(x => x.bpDiastolic), r.map(x => x.bpDiastolicPm)), highlight: true }] },
    { title: '脈拍', unit: '回/分', rows: [{ label, value: avgCombined(r.map(x => x.pulse), r.map(x => x.pulsePm)), highlight: true }] },
    { title: '体温', unit: '℃', rows: [{ label, value: avgCombined(r.map(x => x.tempMorning), r.map(x => x.tempAfternoon)), highlight: true }] },
    { title: '水分摂取', unit: 'ml', rows: [{ label, value: avgCombined(r.map(x => x.fluidIntakeAm), r.map(x => x.fluidIntakePm)), highlight: true }] },
    {
      title: '食事量', unit: '割',
      rows: [
        { label: '主食', value: avg(r.map(x => x.mealMainFood)), highlight: false },
        { label: '主菜', value: avg(r.map(x => x.mealSideFood)), highlight: false },
      ],
    },
    {
      title: '体重', unit: 'kg',
      rows: [{ label, value: avg(r.map(x => (x.weight != null && x.weight > 0) ? x.weight : null)), highlight: true }],
    },
  ]
}

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

/** 日別推移グラフ用のデータ（1日〜末日） */
export function buildChartData(records: Rec[], year: number, month: number): ChartData {
  const lastDay = new Date(year, month, 0).getDate()
  const allDays = Array.from({ length: lastDay }, (_, i) => i + 1)
  const byDay = new Map<number, Rec>()
  for (const rec of records) byDay.set(parseInt(rec.date.split('-')[2]), rec)

  return {
    days: allDays,
    bpSys:  allDays.map(d => byDay.get(d)?.bpSystolic ?? null),
    bpDia:  allDays.map(d => byDay.get(d)?.bpDiastolic ?? null),
    pulse:  allDays.map(d => byDay.get(d)?.pulse ?? null),
    temp:   allDays.map(d => byDay.get(d)?.tempMorning ?? null),
    fluid:  allDays.map(d => {
      const rec = byDay.get(d)
      if (!rec) return null
      const am = rec.fluidIntakeAm ?? 0
      const pm = rec.fluidIntakePm ?? 0
      return (am > 0 || pm > 0) ? am + pm : null
    }),
    // 食事量は主食と主菜の平均。どちらか一方しか記録が無い日は、その値をそのまま使う
    meal:   allDays.map(d => {
      const rec = byDay.get(d)
      if (!rec) return null
      const vals = [rec.mealMainFood, rec.mealSideFood].filter((v): v is number => v != null)
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }),
    weight: allDays.map(d => {
      const w = byDay.get(d)?.weight
      return (w != null && w > 0) ? w : null
    }),
  }
}

/** その月に登録された写真（署名付きURL） */
export async function loadResidentPhotos(residentId: string, year: number, month: number) {
  const { data: photoRows } = await supabase
    .from('ResidentMonthlyPhoto')
    .select('id, storagePath')
    .eq('residentId', residentId)
    .eq('year', year)
    .eq('month', month)
    .order('sortOrder', { ascending: true })

  if (!photoRows || photoRows.length === 0) return []

  const { data: signedUrls } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(photoRows.map(p => p.storagePath), 3600)
  return photoRows
    .map((p, i) => ({ id: p.id, url: signedUrls?.[i]?.signedUrl ?? '' }))
    .filter(p => p.url)
}

export interface WeightTrend {
  /** 前々月・前月・当月の順。記録のある月だけが入る */
  months: { label: string; avg: number; min: number; max: number; count: number }[]
  /** いちばん古い月から当月までの増減（2か月以上そろっている場合のみ） */
  change: number | null
  /** グラフ用。測定した日の値を古い順に並べたもの */
  points: number[]
  /** 横軸の目盛り。各月の最初の測定日に「◯月」を置く */
  ticks: { index: number; label: string }[]
}

/**
 * 体重の推移。当月の平均だけでは増減が読み取れないため、前々月からの3か月分を月ごとにまとめる。
 * 測定回数が月に数回のため折れ線では読み取りにくく、数値で並べている。
 */
export async function loadWeightTrend(residentId: string, year: number, month: number): Promise<WeightTrend> {
  const start = new Date(year, month - 3, 1)
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data } = await supabase
    .from('DailyRecord')
    .select('date, weight')
    .eq('residentId', residentId)
    .gte('date', from).lte('date', to)
    .order('date', { ascending: true })

  const measured = (data ?? [] as Rec[]).filter((r: Rec) => r.weight != null && r.weight > 0)

  const byMonth = new Map<string, number[]>()
  const ticks: { index: number; label: string }[] = []
  let lastKey = ''
  measured.forEach((rec: Rec, i: number) => {
    const key = (rec.date as string).slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(rec.weight as number)
    if (key !== lastKey) {
      ticks.push({ index: i, label: `${parseInt(key.slice(5, 7))}月` })
      lastKey = key
    }
  })

  const months = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, values]) => ({
      label: `${parseInt(key.slice(5, 7))}月`,
      avg: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    }))

  const change = months.length >= 2
    ? parseFloat((months[months.length - 1].avg - months[0].avg).toFixed(1))
    : null

  return { months, change, points: measured.map((r: Rec) => r.weight as number), ticks }
}