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

// グラフを持たない項目。利用者を選んでいるときは、血圧・脈拍・体温はグラフの見出しに、
// それ以外は月次報告書の「当月の概要」に数値を出しているため、いまは空。
// どちらにも出さない項目を足したときにここへ入れれば、カードとして出る。
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
  spo2: (number | null)[]
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
    // SpO2は入浴の前後で2回測ることがあるため、その日に測れた値の平均をとる
    spo2:   allDays.map(d => {
      const rec = byDay.get(d)
      if (!rec) return null
      const vals = [rec.spo2Before, rec.spo2After].filter((v): v is number => v != null && v > 0)
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }),
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

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 服薬欄に出す時間帯。記録の項目名と表示名をここで対応させている */
const MEDICATION_TIMINGS: [string, string][] = [
  ['medicationMorning', '朝'],
  ['medicationBeforeLunch', '昼前'],
  ['medicationAfterLunch', '昼後'],
  ['medicationBeforeEvening', '夕前'],
  ['medicationEvening', '夕後'],
]

/** 月次報告書の「日別記録」1行分 */
export interface DailyRow {
  date: string
  day: number
  weekday: string
  isAbsent: boolean
  absenceReason: string | null
  mealMain: number | null
  mealSide: number | null
  fluid: number | null
  weight: number | null
  bowel: string | null
  medication: string | null
  oralCare: boolean
  bathing: string
  training: boolean
  hasNote: boolean
}

/**
 * 日別記録の表に出す行。ご利用のあった日を日付順に並べる。
 * 画面と印刷の両方から使うため、記録そのものではなく表示に必要な形にして渡す。
 */
export function buildDailyRows(records: Rec[]): DailyRow[] {
  return [...records]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(rec => {
      const date = String(rec.date).slice(0, 10)
      const [y, m, d] = date.split('-').map(Number)
      const am = rec.fluidIntakeAm ?? 0
      const pm = rec.fluidIntakePm ?? 0
      const taken = MEDICATION_TIMINGS.filter(([field]) => rec[field]).map(([, label]) => label)
      return {
        date,
        day: d,
        weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()],
        isAbsent: !!rec.isAbsent,
        absenceReason: rec.absenceReason ?? null,
        mealMain: rec.mealMainFood ?? null,
        mealSide: rec.mealSideFood ?? null,
        fluid: (am > 0 || pm > 0) ? am + pm : null,
        weight: (rec.weight != null && rec.weight > 0) ? rec.weight : null,
        bowel: [rec.bowelAmount, rec.bowelQuality].filter(Boolean).join(' / ') || null,
        medication: taken.length ? taken.join(' ') : null,
        oralCare: !!rec.oralCare,
        bathing: rec.bathing ?? 'NOT_APPLICABLE',
        training: !!rec.trainingDone,
        hasNote: !!rec.specialNotes?.trim(),
      }
    })
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
