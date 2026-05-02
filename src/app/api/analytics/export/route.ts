import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

function avg(arr: (number | null | undefined)[]) {
  const valid = arr.filter((v): v is number => v != null)
  return valid.length ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)) : null
}
function countOf(arr: boolean[]) { return arr.filter(Boolean).length }

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const residentId = searchParams.get('residentId') || ''

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

  // ── シート1: バイタル月平均 ──
  const vitalRows = [
    ['対象', `${year}年${month}月`, '利用者', targetName, '記録件数', total],
    [],
    ['項目', 'AM平均', 'PM平均', 'AM+PM合算平均', '単位'],
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
  ]

  // ── シート2: ケア実施回数 ──
  const careRows = [
    ['対象', `${year}年${month}月`, '利用者', targetName, '記録件数', total],
    [],
    ['項目', '実施回数', '対象件数', '実施率(%)'],
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
  ]

  // ── シート3: 日別詳細 ──
  const detailHeader = [
    '日付', '利用者名',
    '血圧AM(収)', '血圧AM(拡)', '血圧PM(収)', '血圧PM(拡)',
    '脈拍AM', '脈拍PM', '体温AM', '体温PM',
    '入浴', '主食(割)', '主菜(割)', '水分AM(ml)', '水分PM(ml)',
    '朝薬', '昼前薬', '昼後薬', '夕薬', '口腔ケア',
    '体重(kg)', 'SpO2前', 'SpO2後', '特記事項',
  ]
  const residentMap = new Map(residents?.map(x => [x.id, x.name]))
  const detailRows = [
    detailHeader,
    ...r.sort((a, b) => a.date.localeCompare(b.date)).map(x => [
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
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vitalRows), 'バイタル月平均')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(careRows), 'ケア実施回数')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), '日別詳細')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `デイサービス集計_${year}年${month}月_${targetName}.xlsx`

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
