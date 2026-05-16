'use client'

import { useState, useTransition } from 'react'
import { type Resident } from '@/types/database'
import { addTemporaryAttendance, removeTemporaryAttendance } from './actions'

interface Props {
  date: string
  nonScheduledResidents: Resident[]
  temporaryResidentIds: string[]
}

export default function AddTemporaryModal({ date, nonScheduledResidents, temporaryResidentIds }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const temporarySet = new Set(temporaryResidentIds)
  const currentTemporary = nonScheduledResidents.filter(r => temporarySet.has(r.id))
  const available = nonScheduledResidents.filter(r => !temporarySet.has(r.id))

  function handleAdd(residentId: string) {
    setPendingId(residentId)
    setErrorMsg(null)
    startTransition(async () => {
      const result = await addTemporaryAttendance({ residentId, date })
      setPendingId(null)
      if (!result.success) setErrorMsg(result.error ?? '追加に失敗しました')
    })
  }

  function handleRemove(residentId: string) {
    setPendingId(residentId)
    setErrorMsg(null)
    startTransition(async () => {
      await removeTemporaryAttendance({ residentId, date })
      setPendingId(null)
    })
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 transition font-medium"
      >
        <span className="text-base leading-none">＋</span>
        臨時利用者を追加
        {temporaryResidentIds.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 text-xs font-semibold">
            {temporaryResidentIds.length}名
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIsOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-800">臨時利用者の追加</h3>
                <p className="text-xs text-gray-400 mt-0.5">本日のスケジュール外の利用者</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {errorMsg && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{errorMsg}</div>
              )}
              {/* 本日追加済み */}
              {currentTemporary.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 mb-2">本日追加済み</p>
                  <div className="space-y-1.5">
                    {currentTemporary.map(r => (
                      <div key={r.id} className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-700 font-semibold">臨時</span>
                          <span className="text-sm font-medium text-gray-800">{r.name}</span>
                        </div>
                        <button
                          onClick={() => handleRemove(r.id)}
                          disabled={pendingId === r.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition"
                        >
                          {pendingId === r.id ? '処理中...' : '解除'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 追加可能な利用者 */}
              {available.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">追加できる利用者</p>
                  <div className="space-y-1.5">
                    {available.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleAdd(r.id)}
                        disabled={pendingId === r.id}
                        className="w-full flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition disabled:opacity-40 text-left"
                      >
                        <span className="text-sm font-medium text-gray-800">{r.name}</span>
                        <span className="text-xs text-teal-600 font-medium">
                          {pendingId === r.id ? '追加中...' : '＋ 追加'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : currentTemporary.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">追加できる利用者がいません</p>
              ) : null}
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
