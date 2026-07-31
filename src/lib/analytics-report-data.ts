import { supabase } from '@/lib/supabase'

export interface ReportTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  /** 列数が多すぎてページに収まらない場合、先頭何列を各分割表に繰り返し表示するか */
  keyColumns?: number
}

export interface AnalyticsReportData {
  year: number
  month: number
  targetName: string
  totalRecords: number
  tables: ReportTable[]
}

function avg(arr: (number | null | undefined)[]) {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)) : null
}
function countOf(arr: boolean[]) { return arr.filter(Boolean).length }

function monthsEndingAt(endYear: number, endMonth: number, count: number) {
  const list: { key: string; label: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonth - 1 - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    list.push({ key, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
  }
  return list
}

export async function buildAnalyticsReportData(year: number, month: number, residentId: string): Promise<AnalyticsReportData> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: residents } = await supabase.from('Resident').select('id, name').eq('isActive', true).order('name')

  let query = supabase.from('DailyRecord').select('*').gte('date', from).lte('date', to)
  if (residentId) query = query.eq('residentId', residentId)
  const { data: records } = await query

  const r = records ?? []
  const total = r.length
  const targetName = residentId
    ? residents?.find(x => x.id === residentId)?.name ?? '不明'
    : '全利用者'

  // ── バイタル月平均 ──
  const vitalTable: ReportTable = {
    title: 'バイタル月平均',
    headers: ['項目', 'AM平均', 'PM平均', 'AM+PM合算平均', '単位'],
    rows: [
      ['血圧（収縮期）',
        avg(r.map(x => x.bpSystolic)),
        avg(r.map(x => x.bpSystolicPm)),
        avg([...r.map(x => x.bpSystolic), ...r.map(x => x.bpSystolicPm)]),
        'mmHg'],
      ['血圧（拡張期）',
        avg(r.map(x => x.bpDiastolic)),
        avg(r.map(x => x.bpDiastolicPm)),
        avg([...r.map(x => x.bpDiastolic), ...r.map(x => x.bpDiastolicPm)]),
        'mmHg'],
      ['脈拍',
        avg(r.map(x => x.pulse)),
        avg(r.map(x => x.pulsePm)),
        avg([...r.map(x => x.pulse), ...r.map(x => x.pulsePm)]),
        '回/分'],
      ['体温',
        avg(r.map(x => x.tempMorning)),
        avg(r.map(x => x.tempAfternoon)),
        avg([...r.map(x => x.tempMorning), ...r.map(x => x.tempAfternoon)]),
        '℃'],
      ['水分摂取',
        avg(r.map(x => x.fluidIntakeAm)),
        avg(r.map(x => x.fluidIntakePm)),
        avg([...r.map(x => x.fluidIntakeAm), ...r.map(x => x.fluidIntakePm)]),
        'ml'],
      ['食事量（主食）', avg(r.map(x => x.mealMainFood)), null, null, '割'],
      ['食事量（主菜）', avg(r.map(x => x.mealSideFood)), null, null, '割'],
    ],
  }

  // ── ケア実施回数 ──
  const careTable: ReportTable = {
    title: 'ケア実施回数',
    headers: ['項目', '実施回数', '対象件数', '実施率(%)'],
    rows: [
      ['入浴',
        countOf(r.map(x => x.bathing === 'DONE')), total,
        total ? Math.round(countOf(r.map(x => x.bathing === 'DONE')) / total * 100) : 0],
      ['口腔ケア',
        countOf(r.map(x => x.oralCare)), total,
        total ? Math.round(countOf(r.map(x => x.oralCare)) / total * 100) : 0],
      ['朝薬',
        countOf(r.map(x => x.medicationMorning)), total,
        total ? Math.round(countOf(r.map(x => x.medicationMorning)) / total * 100) : 0],
      ['昼薬（昼前+昼後）',
        countOf(r.map(x => x.medicationBeforeLunch || x.medicationAfterLunch)), total,
        total ? Math.round(countOf(r.map(x => x.medicationBeforeLunch || x.medicationAfterLunch)) / total * 100) : 0],
      ['夕薬',
        countOf(r.map(x => x.medicationEvening)), total,
        total ? Math.round(countOf(r.map(x => x.medicationEvening)) / total * 100) : 0],
    ],
  }

  // ── 日別詳細 ──
  const residentMap = new Map(residents?.map(x => [x.id, x.name]))
  const detailTable: ReportTable = {
    title: '日別詳細',
    keyColumns: 2,
    headers: [
      '日付', '利用者名',
      '血圧AM(収)', '血圧AM(拡)', '血圧PM(収)', '血圧PM(拡)',
      '脈拍AM', '脈拍PM', '体温AM', '体温PM',
      '入浴', '主食(割)', '主菜(割)', '水分AM(ml)', '水分PM(ml)',
      '朝薬', '昼前薬', '昼後薬', '夕薬', '口腔ケア',
      '体重(kg)', 'SpO2前', 'SpO2後', '特記事項',
    ],
    rows: r.sort((a, b) => a.date.localeCompare(b.date)).map(x => [
      x.date,
      residentMap.get(x.residentId) ?? '',
      x.bpSystolic, x.bpDiastolic, x.bpSystolicPm, x.bpDiastolicPm,
      x.pulse, x.pulsePm, x.tempMorning, x.tempAfternoon,
      x.bathing === 'DONE' ? '○' : x.bathing === 'NOT_DONE' ? '×' : '-',
      x.mealMainFood, x.mealSideFood, x.fluidIntakeAm, x.fluidIntakePm,
      x.medicationMorning ? '○' : '',
      x.medicationBeforeLunch ? '○' : '',
      x.medicationAfterLunch ? '○' : '',
      x.medicationEvening ? '○' : '',
      x.oralCare ? '○' : '',
      x.weight, x.spo2Before, x.spo2After, x.specialNotes ?? '',
    ]),
  }

  // ── 体重推移（直近3ヶ月） ──
  const WEIGHT_TREND_MONTHS = 3
  const weightMonths = monthsEndingAt(year, month, WEIGHT_TREND_MONTHS)
  const weightFrom = `${weightMonths[0].key}-01`

  let weightTable: ReportTable
  if (residentId) {
    const { data: weightRaw } = await supabase
      .from('DailyRecord')
      .select('date, weight')
      .eq('residentId', residentId)
      .not('weight', 'is', null)
      .gte('date', weightFrom)
      .lte('date', to)
      .order('date', { ascending: true })
    const weightRecords = (weightRaw ?? []).filter(x => x.weight != null) as { date: string; weight: number }[]

    const rows: (string | number | null)[][] = weightRecords.map((x, i) => [
      x.date,
      x.weight,
      i > 0 ? parseFloat((x.weight - weightRecords[i - 1].weight).toFixed(1)) : null,
    ])
    if (weightRecords.length >= 2) {
      const diff = parseFloat((weightRecords[weightRecords.length - 1].weight - weightRecords[0].weight).toFixed(1))
      rows.push(['期間内増減', diff, null])
    }
    weightTable = {
      title: `体重推移（${weightMonths[0].label} 〜 ${weightMonths[WEIGHT_TREND_MONTHS - 1].label}）`,
      headers: ['測定日', '体重(kg)', '前回比(kg)'],
      rows,
    }
  } else {
    const residentIds = (residents ?? []).map(x => x.id)
    const { data: weightRaw } = residentIds.length
      ? await supabase
          .from('DailyRecord')
          .select('residentId, date, weight')
          .in('residentId', residentIds)
          .not('weight', 'is', null)
          .gte('date', weightFrom)
          .lte('date', to)
          .order('date', { ascending: true })
      : { data: [] }
    const weightRecords = (weightRaw ?? []).filter(x => x.weight != null) as { residentId: string; date: string; weight: number }[]

    const byResidentMonth = new Map<string, Map<string, number>>()
    for (const x of weightRecords) {
      const mk = x.date.slice(0, 7)
      if (!byResidentMonth.has(x.residentId)) byResidentMonth.set(x.residentId, new Map())
      byResidentMonth.get(x.residentId)!.set(mk, x.weight)
    }

    const rows: (string | number | null)[][] = []
    for (const res of residents ?? []) {
      const monthly = byResidentMonth.get(res.id) ?? new Map<string, number>()
      const values = weightMonths.map(m => monthly.get(m.key) ?? null)
      const measured = values.filter((v): v is number => v != null)
      const diff = measured.length >= 2 ? parseFloat((measured[measured.length - 1] - measured[0]).toFixed(1)) : null
      rows.push([res.name, ...values, diff])
    }
    weightTable = {
      title: '体重推移',
      headers: ['利用者名', ...weightMonths.map(m => m.label), '期間内増減(kg)'],
      rows,
    }
  }

  return {
    year,
    month,
    targetName,
    totalRecords: total,
    tables: [vitalTable, careTable, weightTable, detailTable],
  }
}
