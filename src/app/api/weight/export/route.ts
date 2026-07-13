import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

function monthLabels(count: number, jstToday: string) {
  const now = new Date(jstToday)
  const months: { key: string; label: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ key, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
  }
  return months
}

export async function GET(request: Request) {
  const session = await requireSession()

  const { searchParams } = new URL(request.url)
  const residentId = searchParams.get('residentId') || ''
  const months = Math.min(Math.max(parseInt(searchParams.get('months') || '3') || 3, 1), 12)

  const jstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const monthList = monthLabels(months, jstToday)
  const rangeFrom = `${monthList[0].key}-01`

  const wb = XLSX.utils.book_new()

  if (residentId) {
    // ── 個別: 選択した利用者の日別体重推移 ──
    const { data: resident } = await supabase
      .from('Resident')
      .select('id, name')
      .eq('id', residentId)
      .eq('facilityId', session.facilityId)
      .maybeSingle()

    if (!resident) {
      return new Response('利用者が見つかりません', { status: 404 })
    }

    const { data: recordsRaw } = await supabase
      .from('DailyRecord')
      .select('date, weight')
      .eq('residentId', residentId)
      .not('weight', 'is', null)
      .gte('date', rangeFrom)
      .lte('date', jstToday)
      .order('date', { ascending: true })

    const records = (recordsRaw ?? []).filter(r => r.weight != null) as { date: string; weight: number }[]

    const rows: (string | number | null)[][] = [
      ['利用者', resident.name, '対象期間', `${monthList[0].label} 〜 ${monthList[months - 1].label}`],
      [],
      ['測定日', '体重(kg)', '前回比(kg)'],
      ...records.map((r, i) => [
        r.date,
        r.weight,
        i > 0 ? parseFloat((r.weight - records[i - 1].weight).toFixed(1)) : null,
      ]),
    ]
    if (records.length >= 2) {
      const diff = parseFloat((records[records.length - 1].weight - records[0].weight).toFixed(1))
      rows.push([], ['期間内増減', diff, null])
    }

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '体重推移')

    const filename = `体重推移_${resident.name}_${monthList[0].label}-${monthList[months - 1].label}.xlsx`
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  }

  // ── 全利用者: 利用者×月の推移表 ──
  const { data: residentsRaw } = await supabase
    .from('Resident')
    .select('id, name, furigana')
    .eq('facilityId', session.facilityId)
    .eq('isActive', true)

  const residents = (residentsRaw ?? []).sort((a, b) =>
    (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, 'ja'),
  )
  const residentIds = residents.map(r => r.id)

  const { data: recordsRaw } = residentIds.length
    ? await supabase
        .from('DailyRecord')
        .select('residentId, date, weight')
        .in('residentId', residentIds)
        .not('weight', 'is', null)
        .gte('date', rangeFrom)
        .lte('date', jstToday)
        .order('date', { ascending: true })
    : { data: [] }

  const records = (recordsRaw ?? []).filter(r => r.weight != null) as { residentId: string; date: string; weight: number }[]

  // 利用者ごと・月ごとの最終測定値
  const byResidentMonth = new Map<string, Map<string, number>>()
  for (const r of records) {
    const monthKey = r.date.slice(0, 7)
    if (!byResidentMonth.has(r.residentId)) byResidentMonth.set(r.residentId, new Map())
    byResidentMonth.get(r.residentId)!.set(monthKey, r.weight)
  }

  const header = ['利用者名', ...monthList.map(m => m.label), '期間内増減(kg)']
  const rows: (string | number | null)[][] = [header]

  for (const resident of residents) {
    const monthly = byResidentMonth.get(resident.id) ?? new Map<string, number>()
    const values = monthList.map(m => monthly.get(m.key) ?? null)
    const measured = values.filter((v): v is number => v != null)
    const diff = measured.length >= 2
      ? parseFloat((measured[measured.length - 1] - measured[0]).toFixed(1))
      : null
    rows.push([resident.name, ...values, diff])
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '体重推移')

  const filename = `体重推移_全利用者_${monthList[0].label}-${monthList[months - 1].label}.xlsx`
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
