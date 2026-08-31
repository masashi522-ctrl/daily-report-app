'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateAndSaveReport } from './report-actions'

interface Target {
  id: string
  name: string
}

type RowState = '未作成' | '作成済み' | '作成中' | '待機中' | '記録なし' | '失敗'

// Groqの無料枠を使う場合のみ、1モデルあたり1日20万トークンの制限がある（1件およそ4,500トークン）
const GROQ_DAILY_CAPACITY = 45
// 何人分を同時に作るか。増やしすぎると利用制限に当たりやすくなるため控えめにしている
const CONCURRENCY = 3

export default function BatchReport({
  residents,
  year,
  month,
  savedIds,
  provider,
}: {
  residents: Target[]
  year: number
  month: number
  savedIds: string[]
  provider: 'claude' | 'groq'
}) {
  const router = useRouter()
  const [states, setStates] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(residents.map(r => [r.id, savedIds.includes(r.id) ? '作成済み' : '未作成'] as const))
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [waitSec, setWaitSec] = useState(0)
  // 1日あたりの上限に当たったときの案内。当日中は待っても作れないので実行を止める
  const [dailyLimit, setDailyLimit] = useState<{ message: string; seconds: number; remaining: number } | null>(null)
  const cancelRef = useRef(false)

  const pending = residents.filter(r => states[r.id] !== '作成済み' && states[r.id] !== '記録なし')
  const doneCount = residents.filter(r => states[r.id] === '作成済み').length
  const selectedTargets = residents.filter(r => selected.has(r.id))

  function setState(id: string, s: RowState) {
    setStates(prev => ({ ...prev, [id]: s }))
  }

  // 選んだ方の報告書を、利用者月次報告の個別印刷と同じ内容で続けて印刷する画面を開く
  function openPrint() {
    const ids = selectedTargets.map(t => t.id).join(',')
    window.open(`/print/care-reports?year=${year}&month=${month}&ids=${ids}`, '_blank')
  }

  function toggle(id: string) {
    if (running) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 1分あたりのトークン上限に当たったら、空くまで待ってから同じ利用者を作り直す。
  // 途中で止めた場合にすぐ抜けられるよう、1秒ずつ数えながら待つ。
  async function waitSeconds(seconds: number) {
    for (let left = seconds; left > 0; left--) {
      if (cancelRef.current) return
      setWaitSec(left)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    setWaitSec(0)
  }

  async function runOne(target: Target, remaining: number) {
    setState(target.id, '作成中')

    // 上限に当たった場合は待ってからもう一度。それでも駄目なら次の利用者へ進む
    for (let attempt = 0; attempt < 3; attempt++) {
      if (cancelRef.current) return
      const result = await generateAndSaveReport(target.id, year, month, false)
      if (result.status === 'ok') {
        setState(target.id, '作成済み')
        setSelected(prev => { const next = new Set(prev); next.delete(target.id); return next })
        return
      }
      if (result.status === 'limit') {
        setState(target.id, '未作成')
        setDailyLimit({ message: result.message, seconds: result.seconds, remaining })
        cancelRef.current = true
        return
      }
      if (result.status === 'skip') {
        setState(target.id, '記録なし')
        return
      }
      if (result.status === 'wait') {
        setState(target.id, '待機中')
        await waitSeconds(result.seconds + 1)
        setState(target.id, '作成中')
        continue
      }
      setErrors(prev => ({ ...prev, [target.id]: result.message }))
      setState(target.id, '失敗')
      return
    }
    if (!cancelRef.current) setState(target.id, '失敗')
  }

  async function run(targets: Target[]) {
    if (targets.length === 0) return
    // 作成済みの方を選んで実行した場合は、今ある本文が置き換わる
    const overwrite = targets.filter(t => states[t.id] === '作成済み')
    if (overwrite.length > 0 &&
        !window.confirm(`作成済みの${overwrite.length}名は作り直しになり、今の本文は上書きされます。よろしいですか？`)) {
      return
    }

    cancelRef.current = false
    setRunning(true)
    setErrors({})
    setDailyLimit(null)

    // 数人ずつ同時に作る。1人ずつだと人数分の待ち時間がそのまま積み上がるため
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      if (cancelRef.current) break
      const chunk = targets.slice(i, i + CONCURRENCY)
      await Promise.all(chunk.map(t => runOne(t, targets.length - i)))
    }

    setRunning(false)
    setWaitSec(0)
    router.refresh()
  }

  if (residents.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:hidden">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">月次報告書をまとめて作成</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {year}年{month}月 ・ {residents.length}名中 {doneCount}名 作成済み
            {waitSec > 0 && <span className="ml-2 text-amber-600">利用上限のため待機中… あと{waitSec}秒</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {running ? (
            <button
              onClick={() => { cancelRef.current = true }}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:border-red-400 transition"
            >
              中断する
            </button>
          ) : (
            <>
              <button
                onClick={() => run(selectedTargets)}
                disabled={selectedTargets.length === 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition disabled:bg-gray-300"
              >
                {selectedTargets.length === 0 ? '選択した方を作成' : `選択した${selectedTargets.length}名を作成`}
              </button>
              <button
                onClick={() => run(pending)}
                disabled={pending.length === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50 transition disabled:border-gray-200 disabled:text-gray-300"
              >
                {pending.length === 0 ? '全員分できています' : `未作成の${pending.length}名を作成`}
              </button>
              <button
                onClick={openPrint}
                disabled={selectedTargets.length === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition disabled:border-gray-200 disabled:text-gray-300 flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {selectedTargets.length === 0 ? 'まとめて印刷' : `選択した${selectedTargets.length}名を印刷`}
              </button>
            </>
          )}
        </div>
      </div>

      {!running && (
        <div className="flex items-center gap-3 mb-2 text-xs">
          <button onClick={() => setSelected(new Set(residents.map(r => r.id)))} className="text-teal-700 hover:underline">全員を選択</button>
          <button onClick={() => setSelected(new Set(pending.map(r => r.id)))} className="text-teal-700 hover:underline">未作成のみ選択</button>
          <button onClick={() => setSelected(new Set())} className="text-gray-500 hover:underline">選択を解除</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {residents.map(r => {
          const state = states[r.id]
          const isSelected = selected.has(r.id)
          const color =
            state === '作成済み' ? 'text-teal-700 bg-teal-50'
            : state === '作成中' ? 'text-blue-700 bg-blue-50'
            : state === '待機中' ? 'text-amber-700 bg-amber-50'
            : state === '記録なし' ? 'text-gray-400 bg-gray-50'
            : state === '失敗' ? 'text-red-700 bg-red-50'
            : 'text-gray-500 bg-gray-50'
          return (
            <label
              key={r.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition ${color} ${
                running ? 'cursor-default' : 'cursor-pointer'
              } ${isSelected ? 'ring-2 ring-teal-400' : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(r.id)}
                disabled={running}
                className="shrink-0 accent-teal-600"
              />
              <span className="truncate flex-1">{r.name}</span>
              <span className="ml-1 shrink-0 font-medium">{state}</span>
            </label>
          )
        })}
      </div>

      {dailyLimit && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">{dailyLimit.message}（残り{dailyLimit.remaining}名）</p>
          <p className="mt-1">
            無料枠は1日あたりのトークン数にも上限があります。
            {dailyLimit.seconds > 0 && `枠が空きはじめるまで約${Math.ceil(dailyLimit.seconds / 60)}分です。`}
            残りは時間をおいてから、または日を改めて作成してください。
          </p>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <ul className="mt-3 text-xs text-red-600 flex flex-col gap-1">
          {Object.entries(errors).map(([id, message]) => (
            <li key={id}>{residents.find(r => r.id === id)?.name}：{message}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        名前を選んで「選択した◯名を作成」を押すと、その方だけ作成します。作成済みの方を選んだ場合は作り直し（上書き）になります。
        「選択した◯名を印刷」を押すと、集計・グラフを含めた個別印刷と同じ内容が、利用者ごとに改ページされて続けて出ます。
        {CONCURRENCY}名ずつ同時に作成し、1名あたり15秒ほどかかります。上限に当たった場合は自動で待って続きから作成します。
        中断しても、作成済みの分は保存されています。
      </p>
      {provider === 'groq' && pending.length > GROQ_DAILY_CAPACITY && (
        <p className="text-[11px] text-amber-700 mt-1">
          今の設定（Groqの無料枠）では1日に作れるのはおよそ{GROQ_DAILY_CAPACITY}名分です。未作成が{pending.length}名あるため、
          {Math.ceil(pending.length / GROQ_DAILY_CAPACITY)}日に分けて実行してください。
        </p>
      )}
    </div>
  )
}
