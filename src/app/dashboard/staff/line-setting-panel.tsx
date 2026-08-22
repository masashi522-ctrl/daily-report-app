'use client'

import { useActionState, useState, useTransition } from 'react'
import { saveLineSetting, clearLineSetting, type LineSettingView } from './line-actions'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 font-mono'

export default function LineSettingPanel({
  setting,
  webhookUrl,
}: {
  setting: LineSettingView
  webhookUrl: string
}) {
  const [state, action, pending] = useActionState(saveLineSetting, null)
  const [editing, setEditing] = useState(!setting.configured)
  const [clearMsg, setClearMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [, startClear] = useTransition()

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
      <div>
        <h3 className="font-semibold text-gray-800">ご家族へのLINE連絡</h3>
        <p className="text-xs text-gray-400 mt-0.5">この施設のLINE公式アカウントを登録します</p>
      </div>

      {state?.error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{state.error}</div>
      )}
      {state?.success && (
        <div className="px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700">{state.success}</div>
      )}
      {clearMsg && (
        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">{clearMsg}</div>
      )}

      {/* 現在の状態 */}
      <div className={`rounded-lg border p-3 ${
        setting.configured ? 'bg-teal-50/50 border-teal-200' : 'bg-amber-50 border-amber-200'
      }`}>
        {setting.configured ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-600 text-white font-semibold">設定済み</span>
              <span className="text-sm font-medium text-gray-800">{setting.botDisplayName ?? '（名称不明）'}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              登録日：{setting.linkedAt ? new Date(setting.linkedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '―'}
            </p>
          </>
        ) : (
          <p className="text-xs text-amber-700">
            未設定です。登録するまで、ご家族への送信はできません。
          </p>
        )}
      </div>

      {/* Webhook URL */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Webhook URL（LINE Developersに設定してください）</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 break-all">{webhookUrl}</code>
          <button type="button"
            onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="shrink-0 text-xs px-2.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        </div>
      </div>

      {editing ? (
        <form action={action} className="flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">チャネルアクセストークン（長期）</label>
            <textarea name="accessToken" rows={3} required
              placeholder="LINE Developers →「Messaging API設定」→ 発行"
              className={`${inputCls} resize-none text-[11px]`} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">チャネルシークレット</label>
            <input name="channelSecret" required
              placeholder="「チャネル基本設定」タブ・32文字"
              className={`${inputCls} text-xs`} />
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            入力した値が本当に使えるかLINEに確認してから保存します。保存後は画面に表示されません。
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending}
              className="flex-1 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50">
              {pending ? '確認中...' : '登録する'}
            </button>
            {setting.configured && (
              <button type="button" onClick={() => setEditing(false)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200 transition">
                キャンセル
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setEditing(true)}
            className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition">
            トークンを入れ直す
          </button>
          <button type="button"
            onClick={() => {
              setClearMsg(null)
              startClear(async () => {
                const res = await clearLineSetting()
                if (res?.error) setClearMsg(res.error)
                else { setClearMsg(res?.success ?? null); setEditing(true) }
              })
            }}
            className="flex-1 bg-white border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50 transition">
            設定を解除する
          </button>
        </div>
      )}
    </div>
  )
}
