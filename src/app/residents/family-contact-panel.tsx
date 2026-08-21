'use client'

import { useState, useTransition } from 'react'
import { FAMILY_RELATIONSHIPS, type FamilyContact, type Resident } from '@/types/database'
import {
  addFamilyContact, updateFamilyContact, deleteFamilyContact,
  issueLinkCode, unlinkFamilyContact, updateShareSettings,
} from './family-actions'

interface Props {
  resident: Resident
  contacts: FamilyContact[]
  lineConfigured: boolean
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400'

export default function FamilyContactPanel({ resident, contacts, lineConfigured }: Props) {
  const [enabled, setEnabled] = useState(resident.familyContactEnabled ?? false)
  const [shareReport, setShareReport] = useState(resident.shareDailyReport ?? false)
  const [sharePhoto, setSharePhoto] = useState(resident.shareActivityPhoto ?? false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  function saveSettings(next: { familyContactEnabled: boolean; shareDailyReport: boolean; shareActivityPhoto: boolean }) {
    setEnabled(next.familyContactEnabled)
    setShareReport(next.shareDailyReport)
    setSharePhoto(next.shareActivityPhoto)
    setErr(null)
    startTransition(async () => {
      const res = await updateShareSettings(resident.id, next)
      if (res?.error) setErr(res.error)
      else setMsg('共有設定を保存しました')
    })
  }

  function run(fn: () => Promise<{ error?: string; success?: string } | null | void>) {
    setErr(null); setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) setErr(res.error)
      else if (res?.success) setMsg(res.success)
    })
  }

  const linked = contacts.filter(c => c.lineUserId)
  const willSend = enabled && (shareReport || sharePhoto) && linked.length > 0

  return (
    <div className="mt-6 pt-5 border-t border-gray-200 flex flex-col gap-4">
      <div>
        <h4 className="font-semibold text-gray-800 text-sm">ご家族への連絡（LINE）</h4>
        <p className="text-xs text-gray-400 mt-0.5">連絡帳と活動写真をご家族のLINEへお送りします</p>
      </div>

      {!lineConfigured && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          LINE公式アカウントの設定がまだ済んでいないため、送信は行われません。設定内容とご家族の登録は先に進められます。
        </div>
      )}
      {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{err}</div>}
      {msg && <div className="px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700">{msg}</div>}

      {/* ── 共有設定 ── */}
      <div className="border border-teal-100 rounded-lg p-3 bg-teal-50/40 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => saveSettings({ familyContactEnabled: e.target.checked, shareDailyReport: shareReport, shareActivityPhoto: sharePhoto })}
            className="w-4 h-4 accent-teal-600"
          />
          ご家族への連絡を有効にする
        </label>

        <div className={`flex flex-col gap-2 pl-6 ${enabled ? '' : 'opacity-40'}`}>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox" disabled={!enabled} checked={shareReport}
              onChange={e => saveSettings({ familyContactEnabled: enabled, shareDailyReport: e.target.checked, shareActivityPhoto: sharePhoto })}
              className="w-4 h-4 accent-teal-600"
            />
            連絡帳を共有する
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox" disabled={!enabled} checked={sharePhoto}
              onChange={e => saveSettings({ familyContactEnabled: enabled, shareDailyReport: shareReport, shareActivityPhoto: e.target.checked })}
              className="w-4 h-4 accent-teal-600"
            />
            活動写真を共有する
          </label>
        </div>

        <p className="text-[11px] text-gray-500 pl-6">
          {willSend
            ? `送信されます（LINE連携済み ${linked.length}名）`
            : !enabled ? '有効にすると送信できます'
            : !shareReport && !sharePhoto ? '連絡帳・活動写真のどちらかにチェックしてください'
            : 'LINE連携済みのご家族がいないため、まだ送信されません'}
        </p>
      </div>

      {/* ── ご家族の一覧 ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-500">
          送信先のご家族<span className="ml-1.5 text-gray-400">{contacts.length}名（LINE連携済み {linked.length}名）</span>
        </p>

        {contacts.length === 0 && (
          <p className="text-xs text-gray-400 py-2">まだ登録されていません</p>
        )}

        {contacts.map(c => (
          <div key={c.id} className="border border-gray-200 rounded-lg p-3 bg-white">
            {editingId === c.id ? (
              <form
                action={async (fd: FormData) => { run(() => updateFamilyContact(c.id, null, fd)); setEditingId(null) }}
                className="flex flex-col gap-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input name="name" defaultValue={c.name} placeholder="氏名" required className={inputCls} />
                  <select name="relationship" defaultValue={c.relationship ?? ''} className={inputCls}>
                    <option value="">続柄を選択</option>
                    {FAMILY_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input name="lineId" defaultValue={c.lineId ?? ''} placeholder="LINE ID" className={inputCls} />
                  <input name="phone" defaultValue={c.phone ?? ''} placeholder="電話番号" className={inputCls} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition">保存</button>
                  <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs hover:bg-gray-200 transition">キャンセル</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{c.name}</span>
                      {c.relationship && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.relationship}</span>}
                      {c.lineUserId ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">LINE連携済み</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">未連携</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {c.lineId ? `LINE ID: ${c.lineId}` : 'LINE ID 未登録'}
                      {c.phone ? `　TEL: ${c.phone}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditingId(c.id)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50 transition">編集</button>
                    <button onClick={() => run(() => deleteFamilyContact(c.id))}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition">削除</button>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {c.lineUserId ? (
                    <button onClick={() => run(() => unlinkFamilyContact(c.id))}
                      className="text-[11px] text-gray-500 hover:text-gray-700 underline">LINE連携を解除</button>
                  ) : (
                    <button
                      onClick={() => {
                        setErr(null); setMsg(null)
                        startTransition(async () => {
                          const res = await issueLinkCode(c.id)
                          if (res.error) setErr(res.error)
                          else if (res.code) setCodes(prev => ({ ...prev, [c.id]: res.code! }))
                        })
                      }}
                      className="text-[11px] px-2 py-1 rounded border border-teal-200 text-teal-700 hover:bg-teal-50 transition"
                    >
                      連携コードを発行
                    </button>
                  )}
                  {codes[c.id] && (
                    <span className="text-[11px] text-gray-600">
                      連携コード：<span className="font-mono font-bold text-base text-teal-700 tracking-widest">{codes[c.id]}</span>
                    </span>
                  )}
                </div>
                {codes[c.id] && (
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                    このコードをご家族にお伝えください。施設のLINE公式アカウントを友だち追加し、トークにこのコードを送っていただくと連携が完了します（30日間有効）。
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── 追加 ── */}
      <form
        action={async (fd: FormData) => { run(() => addFamilyContact(resident.id, null, fd)) }}
        className="border border-dashed border-gray-300 rounded-lg p-3 flex flex-col gap-2"
      >
        <p className="text-xs font-semibold text-gray-500">ご家族を追加</p>
        <div className="grid grid-cols-2 gap-2">
          <input name="name" placeholder="氏名" required className={inputCls} />
          <select name="relationship" defaultValue="" className={inputCls}>
            <option value="">続柄を選択</option>
            {FAMILY_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input name="lineId" placeholder="LINE ID" className={inputCls} />
          <input name="phone" placeholder="電話番号" className={inputCls} />
        </div>
        <button type="submit" className="self-start px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition">
          ＋ 追加
        </button>
      </form>
    </div>
  )
}
