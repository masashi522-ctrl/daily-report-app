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

  const { data: plan } = await supabase
    .from('CarePlan')
    .select('*')
    .eq('residentId', residentId)
    .maybeSingle()
  if (!plan) return new Response('介護計画書がまだ保存されていません', { status: 404 })

  // 要支援の方は介護予防通所介護計画書の様式で出力する
  const isPrevention = !!(resident.careLevel as string | null)?.startsWith('要支援')
  const filenameBase = isPrevention
    ? `介護予防通所介護計画書_${resident.name}`
    : `介護計画書_${resident.name}`

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
