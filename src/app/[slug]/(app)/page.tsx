import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// 施設URL（/genkimura など）の入口。URLの正当性だけ確認して、
// 通常の入口である日次記録へ送る
export default async function FacilitySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await requireSession()
  const { slug } = await params

  const { data: facility } = await supabase
    .from('Facility')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()

  if (!facility) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-500">
        <p className="text-base">このURLは存在しません</p>
        <Link href="/dashboard" className="text-sm text-teal-600 underline">ダッシュボードへ</Link>
      </div>
    )
  }

  if (session.facilityId !== facility.id) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="font-semibold text-gray-800">このURLは「{facility.name}」専用です</p>
        <p className="text-sm text-gray-500">現在別の施設としてログインしています</p>
        <Link href="/dashboard" className="mt-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 transition">
          自分のダッシュボードへ
        </Link>
      </div>
    )
  }

  redirect('/dashboard')
}
