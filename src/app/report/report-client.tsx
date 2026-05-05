'use client'

import { useState } from 'react'
import { type Resident } from '@/types/database'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function prevDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() - 1)
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}
function nextDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function careLevelColor(careLevel: string | null) {
  if (!careLevel) return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' }
  if (careLevel.startsWith('要介護')) return { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' }
  return { bg: 'bg-sky-50', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' }
}

type Group = { label: string; residents: Resident[] }

export default function ReportClient({
  residents,
  date,
}: {
  residents: Resident[]
  date: string
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const dateLabel = `${y}年${m}月${d}日（${DOW[dow]}曜日）`

  // 要介護・要支援・未設定でグループ化
  const groups: Group[] = [
    { label: '要介護', residents: residents.filter(r => r.careLevel?.startsWith('要介護')) },
    { label: '要支援', residents: residents.filter(r => r.careLevel?.startsWith('要支援')) },
    { label: '区分未設定', residents: residents.filter(r => !r.careLevel) },
  ].filter(g => g.residents.length > 0)

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectGroup(ids: string[]) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(residents.map(r => r.id)))
  }
  function clearAll() {
    setSelectedIds(new Set())
  }

  async function handleGenerate() {
    if (selectedIds.size === 0 || loading) return
    setLoading(true)
    try {
      const ids = [...selectedIds].join(',')
      const res = await fetch(`/api/daily-report?date=${date}&residentIds=${ids}`)
      if (!res.ok) throw new Error('生成に失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `連絡帳_${date}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('連絡帳の生成に失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">連絡帳生成</h2>
          <p className="text-sm text-gray-500">{dateLabel}・利用者 {residents.length}名</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/report?date=${prevDate(date)}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">◀ 前日</a>
          <a href="/report"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">今日</a>
          <a href={`/report?date=${nextDate(date)}`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-teal-400 transition">翌日 ▶</a>
        </div>
      </div>

      {/* 全選択・全解除 */}
      <div className="flex items-center gap-2">
        <button onClick={selectAll}
          className="text-xs px-3 py-1.5 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 transition font-medium">
          全選択
        </button>
        <button onClick={clearAll}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition font-medium">
          全解除
        </button>
        <span className="text-xs text-gray-500 ml-1">{selectedIds.size}名 選択中</span>
      </div>

      {/* グループ別利用者一覧 */}
      {groups.map(group => {
        const groupIds = group.residents.map(r => r.id)
        const allSelected = groupIds.every(id => selectedIds.has(id))
        const someSelected = groupIds.some(id => selectedIds.has(id))

        const isKaigo = group.label === '要介護'
        const isShien = group.label === '要支援'
        const headerBg = isKaigo
          ? 'from-rose-500 to-pink-600'
          : isShien
          ? 'from-sky-500 to-blue-600'
          : 'from-gray-400 to-gray-500'

        return (
          <div key={group.label} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`flex items-center justify-between px-4 py-2.5 bg-gradient-to-r ${headerBg}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{group.label}</span>
                <span className="text-xs text-white/80">{group.residents.length}名</span>
              </div>
              <button
                onClick={() => selectGroup(groupIds)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition border ${
                  allSelected
                    ? 'bg-white/20 text-white border-white/40 hover:bg-white/30'
                    : someSelected
                    ? 'bg-white/10 text-white/80 border-white/30 hover:bg-white/20'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
                }`}>
                {allSelected ? '全解除' : 'グループ選択'}
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {group.residents.map(resident => {
                const isSelected = selectedIds.has(resident.id)
                const colors = careLevelColor(resident.careLevel)

                return (
                  <label key={resident.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? colors.bg : 'hover:bg-gray-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(resident.id)}
                      className="w-4 h-4 accent-teal-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                          {resident.name}
                        </span>
                        {resident.careLevel && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.badge}`}>
                            {resident.careLevel}
                          </span>
                        )}
                      </div>
                      {(resident.serviceStartTime || resident.serviceTimeCategory) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {resident.serviceStartTime && `開始 ${resident.serviceStartTime}`}
                          {resident.serviceTimeCategory && ` ／ ${resident.serviceTimeCategory}時間`}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}

      {residents.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p>この日に記録のある利用者がいません</p>
          <a href="/dashboard" className="mt-2 inline-block text-teal-600 underline text-sm">日次記録へ</a>
        </div>
      )}

      {/* 生成ボタン（下部固定） */}
      <div className="sticky bottom-4 mt-2">
        <button
          onClick={handleGenerate}
          disabled={selectedIds.size === 0 || loading}
          className={`w-full py-3.5 rounded-xl text-sm font-bold shadow-lg transition flex items-center justify-center gap-2 ${
            selectedIds.size === 0
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : loading
              ? 'bg-teal-400 text-white cursor-not-allowed'
              : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700'
          }`}>
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              AIで連絡帳を生成中...（しばらくお待ちください）
            </>
          ) : selectedIds.size === 0 ? (
            '利用者を選択してください'
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {selectedIds.size}名の連絡帳を生成・ダウンロード
            </>
          )}
        </button>
        {selectedIds.size > 0 && !loading && (
          <p className="text-center text-xs text-gray-400 mt-1.5">
            1シートにつき1名・AIによる日中のご様子を自動生成します
          </p>
        )}
      </div>
    </div>
  )
}
