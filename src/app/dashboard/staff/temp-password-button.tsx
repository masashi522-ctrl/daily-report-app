'use client'

import { useState, useTransition } from 'react'
import { issueTempPassword } from './actions'

/**
 * パスワードを忘れた職員に渡す一時パスワードを発行する。
 * 発行した値は画面を離れると二度と見られないため、その場で控えてもらう。
 */
export default function TempPasswordButton({ id, name }: { id: string; name: string }) {
  const [password, setPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  function issue() {
    if (!confirm(
      `${name} の一時パスワードを発行しますか？\n\n` +
      `いまのパスワードは使えなくなります。\n` +
      `発行後は画面に一度だけ表示されます。`
    )) return

    setError(null)
    setPassword(null)
    start(async () => {
      const res = await issueTempPassword(id)
      if (res.error) setError(res.error)
      else if (res.password) setPassword(res.password)
    })
  }

  if (password) {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm font-bold tracking-wider bg-amber-50 border border-amber-300 rounded px-2.5 py-1 text-amber-900">
            {password}
          </code>
          <button type="button"
            onClick={() => { navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        </div>
        <p className="text-[10px] text-amber-700 text-right leading-tight">
          この画面を離れると二度と表示されません。<br />
          本人に伝え、ログイン後に変更してもらってください。
        </p>
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={issue} disabled={pending}
        className="text-xs text-amber-700 hover:text-amber-900 px-2 py-1 rounded border border-amber-200 hover:bg-amber-50 transition disabled:opacity-40 whitespace-nowrap">
        {pending ? '発行中...' : '一時パスワード'}
      </button>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  )
}
