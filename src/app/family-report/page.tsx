import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import FamilyReportClient, { type Cell, type RowResident } from './family-report-client'
import type { FamilyMessageLog, Resident, FamilyContact } from '@/types/database'

/** 直近何日分を表示するか（2週間） */
const DAYS = 14

function toDateStr(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

export default async function FamilyReportPage() {
  const session = await requireSession()

  const today = toDateStr(new Date())
  const dates: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - i)
    dates.push(d.toLocaleDateString('sv-SE'))
  }
  const from = dates[0]

  const [{ data: residentRows }, { data: logRows }] = await Promise.all([
    supabase.from('Resident')
      .select('id, name, furigana, familyContactEnabled, shareDailyReport, shareActivityPhoto')
      .eq('facilityId', session.facilityId).eq('isActive', true)
      .order('furigana', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase.from('FamilyMessageLog')
      .select('residentId, date, kind, status')
      .eq('facilityId', session.facilityId)
      .gte('date', from).lte('date', today),
  ])

  const residents = (residentRows ?? []) as Pick<Resident,
    'id' | 'name' | 'furigana' | 'familyContactEnabled' | 'shareDailyReport' | 'shareActivityPhoto'>[]

  // 連携済みのご家族がいるかを利用者ごとに数える
  const { data: contactRows } = residents.length > 0
    ? await supabase.from('FamilyContact')
        .select('residentId, lineUserId')
        .eq('facilityId', session.facilityId).eq('isActive', true)
        .in('residentId', residents.map(r => r.id))
    : { data: [] }

  const linkedCount = new Map<string, number>()
  for (const c of (contactRows ?? []) as Pick<FamilyContact, 'residentId' | 'lineUserId'>[]) {
    if (c.lineUserId) linkedCount.set(c.residentId, (linkedCount.get(c.residentId) ?? 0) + 1)
  }

  // 利用者 × 日付ごとに、送信できたか失敗したかをまとめる
  const cellMap = new Map<string, Cell>()
  for (const l of (logRows ?? []) as Pick<FamilyMessageLog, 'residentId' | 'date' | 'kind' | 'status'>[]) {
    const key = `${l.residentId}|${l.date}`
    const cur = cellMap.get(key) ?? { status: 'SENT' as const, report: false, photo: false }
    if (l.status === 'FAILED') cur.status = 'FAILED'
    if (l.kind === 'REPORT') cur.report = true
    if (l.kind === 'PHOTO') cur.photo = true
    cellMap.set(key, cur)
  }

  const rows: RowResident[] = residents.map(r => ({
    id: r.id,
    name: r.name,
    furigana: r.furigana,
    enabled: r.familyContactEnabled === true,
    shareReport: r.shareDailyReport === true,
    sharePhoto: r.shareActivityPhoto === true,
    linked: linkedCount.get(r.id) ?? 0,
    cells: Object.fromEntries(
      dates.map(d => [d, cellMap.get(`${r.id}|${d}`) ?? null]),
    ),
  }))

  return <FamilyReportClient dates={dates} residents={rows} today={today} />
}
