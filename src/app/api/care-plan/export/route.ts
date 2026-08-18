import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { buildCarePlanExcel } from '@/lib/care-plan-document'
import { buildPreventionCarePlanExcel } from '@/lib/prevention-care-plan-document'
import type { CarePlan, Resident } from '@/types/database'

export async function GET(request: Request) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const residentId = searchParams.get('residentId') ?? ''

  if (!residentId) return new Response('residentId is required', { status: 400 })

  const { data: resident } = await supabase
    .from('Resident')
    .select('*')
    .eq('id', residentId)
    .eq('facilityId', session.facilityId)
    .maybeSingle()
  if (!resident) return new Response('Resident not found', { status: 404 })

  // historyId が指定されたときは、その版の控えを出力する
  const historyId = searchParams.get('historyId') ?? ''
  let plan: unknown = null
  let versionLabel = ''
  let planTypeFromHistory: string | null = null

  if (historyId) {
    const { data: entry } = await supabase
      .from('CarePlanHistory')
      .select('*')
      .eq('id', historyId)
      .eq('residentId', residentId)
      .maybeSingle()
    if (!entry) return new Response('指定された版が見つかりません', { status: 404 })
    plan = entry.snapshot
    versionLabel = `_第${entry.version}版`
    planTypeFromHistory = entry.planType as string
  } else {
    const { data } = await supabase
      .from('CarePlan')
      .select('*')
      .eq('residentId', residentId)
      .maybeSingle()
    plan = data
  }
  if (!plan) return new Response('介護計画書がまだ保存されていません', { status: 404 })

  // 要支援の方は介護予防通所介護計画書の様式で出力する
  const isPrevention = planTypeFromHistory
    ? planTypeFromHistory === 'prevention'
    : !!(resident.careLevel as string | null)?.startsWith('要支援')
  const filenameBase = isPrevention
    ? `介護予防通所介護計画書_${resident.name}${versionLabel}`
    : `介護計画書_${resident.name}${versionLabel}`

  const wb = isPrevention
    ? buildPreventionCarePlanExcel(resident as Resident, session.facilityName, plan as CarePlan)
    : buildCarePlanExcel(resident as Resident, session.facilityName, plan as CarePlan)
  const buf = await wb.xlsx.writeBuffer()
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}
