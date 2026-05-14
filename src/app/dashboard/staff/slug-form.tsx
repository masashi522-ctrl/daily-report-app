'use client'

import { useActionState } from 'react'
import { updateFacilitySlug } from './actions'

export default function SlugForm({ currentSlug }: { currentSlug: string | null }) {
  const [state, action, pending] = useActionState(updateFacilitySlug, null)

  return (
    <form action={action} className="flex flex-col gap-2">
      {state?.error && <p className="text-red-600 text-xs">{state.error}</p>}
      {state?.success && <p className="text-emerald-600 text-xs font-medium">{state.success}</p>}
      <div className="flex gap-2 items-center">
        <span className="text-sm text-blue-600 font-mono shrink-0 hidden sm:inline">…vercel.app/</span>
        <input
          name="slug"
          type="text"
          defaultValue={currentSlug ?? ''}
          placeholder="muraday"
          pattern="[a-z0-9\-]{2,30}"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-60 hover:bg-blue-500 transition whitespace-nowrap"
        >
          {pending ? '保存中...' : '保存'}
        </button>
      </div>
      <p className="text-xs text-gray-400">英小文字・数字・ハイフンのみ（2〜30文字）</p>
    </form>
  )
}
