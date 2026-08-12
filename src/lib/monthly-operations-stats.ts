import { supabase } from '@/lib/supabase'
import { SERVICE_TIME_CATEGORIES } from '@/types/database'

export interface DayBreakdown {
  date: string
  dow: number
  attend: number
  absent: number
}

export interface CareLevelGroupStat {
  label: string
  residentCount: number
  visitCount: number
}

export interface CategoryStat {
  category: string
  capacity: number | null
  totalVisits: number
  occupancyRate: number | null
}

export interface MonthlyOperationsStats {
  year: number
  month: number
  businessDays: number
  totalVisits: number
  uniqueResidents: number
  absentCount: number
  absentRate: number | null
  occupancyRate: number | null
  capacity: number | null
  days: DayBreakdown[]
  careLevelGroups: CareLevelGroupStat[]
  categoryStats: CategoryStat[]
}

function groupLabel(careLevel: string | null): string {
  if (!careLevel) return '区分未設定'
  if (careLevel.startsWith('要介護')) return '要介護'
  if (careLevel.startsWith('要支援')) return '要支援'
  return '区分未設定'
}

// 「営業日」は、その日に1件以上の日次記録（利用・欠席）があった日として推定する
export async function computeMonthlyOperationsStats(
  facilityId: string,
  year: number,
  month: number,
): Promise<MonthlyOperationsStats> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [{ data: facilityRaw }, { data: residentsRaw }] = await Promise.all([
    supabase.from('Facility').select('capacity, capacityByCategory').eq('id', facilityId).maybeSingle(),
    supabase.from('Resident').select('id, careLevel, serviceTimeCategory').eq('facilityId', facilityId),
  ])

  const capacity: number | null = facilityRaw?.capacity ?? null
  const capacityByCategory = (facilityRaw?.capacityByCategory ?? {}) as Record<string, number>
  const residents = residentsRaw ?? []
  const residentIds = residents.map(r => r.id)

  let records: { residentId: string; date: string; isAbsent: boolean }[] = []
  if (residentIds.length > 0) {
    const { data } = await supabase
      .from('DailyRecord')
      .select('residentId, date, isAbsent')
      .in('residentId', residentIds)
      .gte('date', from)
      .lte('date', to)
    records = data ?? []
  }

  const byDate = new Map<string, { attend: number; absent: number }>()
  for (const rec of records) {
    const entry = byDate.get(rec.date) ?? { attend: 0, absent: 0 }
    if (rec.isAbsent) entry.absent++
    else entry.attend++
    byDate.set(rec.date, entry)
  }

  const days: DayBreakdown[] = Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = byDate.get(date)
    return {
      date,
      dow: new Date(date + 'T00:00:00').getDay(),
      attend: entry?.attend ?? 0,
      absent: entry?.absent ?? 0,
    }
  }).filter(d => d.attend > 0 || d.absent > 0)

  const businessDays = days.length
  const totalVisits = days.reduce((s, d) => s + d.attend, 0)
  const totalAbsent = days.reduce((s, d) => s + d.absent, 0)
  const uniqueResidents = new Set(records.filter(r => !r.isAbsent).map(r => r.residentId)).size
  const scheduledTotal = totalVisits + totalAbsent
  const absentRate = scheduledTotal > 0 ? parseFloat(((totalAbsent / scheduledTotal) * 100).toFixed(1)) : null
  const occupancyRate = capacity && businessDays > 0
    ? parseFloat(((totalVisits / (capacity * businessDays)) * 100).toFixed(1))
    : null

  const groupOrder = ['要介護', '要支援', '区分未設定']
  const careLevelGroups: CareLevelGroupStat[] = groupOrder
    .map(label => {
      const idsInGroup = new Set(residents.filter(r => groupLabel(r.careLevel) === label).map(r => r.id))
      const visitsInGroup = records.filter(r => !r.isAbsent && idsInGroup.has(r.residentId))
      const residentSet = new Set(visitsInGroup.map(r => r.residentId))
      return { label, residentCount: residentSet.size, visitCount: visitsInGroup.length }
    })
    .filter(g => g.residentCount > 0 || g.visitCount > 0)

  const categoryStats: CategoryStat[] = SERVICE_TIME_CATEGORIES
    .map(category => {
      const idsInCategory = new Set(residents.filter(r => r.serviceTimeCategory === category).map(r => r.id))
      const visits = records.filter(r => !r.isAbsent && idsInCategory.has(r.residentId)).length
      const cap = capacityByCategory[category] ?? null
      const rate = cap && businessDays > 0 ? parseFloat(((visits / (cap * businessDays)) * 100).toFixed(1)) : null
      return { category, capacity: cap, totalVisits: visits, occupancyRate: rate }
    })
    .filter(c => c.totalVisits > 0 || c.capacity != null)

  return {
    year,
    month,
    businessDays,
    totalVisits,
    uniqueResidents,
    absentCount: totalAbsent,
    absentRate,
    occupancyRate,
    capacity,
    days,
    careLevelGroups,
    categoryStats,
  }
}
