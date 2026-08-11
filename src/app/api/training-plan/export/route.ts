import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { buildTrainingPlanExcel } from '@/lib/training-plan-document'
import type { TrainingPlan } from '@/types/database'

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
    .from('TrainingPlan')
    .select('*')
    .eq('residentId', residentId)
    .maybeSingle()
  if (!plan) return new Response('機能訓練計画書がまだ保存されていません', { status: 404 })

  const filenameBase = `機能訓練計画書_${resident.name}`

  const wb = buildTrainingPlanExcel(resident, session.facilityName, plan as TrainingPlan)
  const buf = await wb.xlsx.writeBuffer()
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}
