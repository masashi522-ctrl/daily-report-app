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

  // 追加済みと未追加でリストを分けると、1人追加するたびに残りの行が上下にずれて
  // 次のクリックが別人に当たってしまう。並び順は固定し、行の中身だけを切り替える
  const temporarySet = new Set(temporaryResidentIds)

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
              {nonScheduledResidents.length > 0 ? (
                <div>
                  {/* 件数は常に表示する。追加時に現れると見出しの行数が変わり一覧がずれるため */}
                  <p className="text-xs font-semibold text-gray-500 mb-2 whitespace-nowrap overflow-hidden text-ellipsis">
                    追加できる利用者
                    <span className="ml-1.5 text-orange-600">本日 {temporaryResidentIds.length}名 追加済み</span>
                  </p>
                  <div className="space-y-1.5">
                    {nonScheduledResidents.map(r => {
                      const isTemp = temporarySet.has(r.id)
                      const isPending = pendingId === r.id
                      return (
                        <div
                          key={r.id}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 border transition ${
                            isTemp ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-800 truncate">{r.name}</span>
                            {isTemp && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-700 font-semibold">臨時</span>
                            )}
                          </div>
                          <button
                            onClick={() => (isTemp ? handleRemove(r.id) : handleAdd(r.id))}
                            disabled={isPending}
                            className={`shrink-0 ml-2 text-xs font-medium px-2 py-0.5 rounded border transition disabled:opacity-40 ${
                              isTemp
                                ? 'text-red-500 border-red-200 hover:text-red-700 hover:bg-red-50'
                                : 'text-teal-600 border-teal-200 hover:text-teal-800 hover:bg-teal-50'
                            }`}
                          >
                            {isPending ? '処理中...' : isTemp ? '解除' : '＋ 追加'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">追加できる利用者がいません</p>
              )}
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
