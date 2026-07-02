import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import FacilityLoginForm from './facility-login-form'

export default async function FacilityLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: facility } = await supabase
    .from('Facility')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!facility) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-gray-500 px-4">
        <p className="text-base">このURLは存在しません</p>
        <a href="/login" className="text-sm text-teal-600 underline">通常のログインへ</a>
      </div>
    )
  }

  const session = await getSession()
  if (session && session.facilitySlug === slug) {
    redirect(`/${slug}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 shadow-sm mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">{facility.name}</h1>
          <p className="text-sm text-stone-500 mt-1">今日もお疲れさまです</p>
        </div>

        <div className="bg-white rounded-3xl shadow-md border border-amber-100 px-8 py-8">
          <FacilityLoginForm slug={slug} />
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          デイサービス バイタル・ケア記録システム
        </p>
      </div>
    </div>
  )
}
