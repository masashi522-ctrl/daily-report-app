'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

interface Suggestion {
  main: string
  subs: string[]
}

// 利用者管理の「性別」「ゴール設定」欄。入力したゴールのイメージをもとにAIが提案する。
// 新規登録フォームと編集フォームの両方から使う。
export default function GoalImageField({
  gender,
  onGenderChange,
  genderSuggested,
  defaultGoalImage,
}: {
  gender: string
  onGenderChange: (gender: string) => void
  /** 氏名からAIが推定した候補が入っているとき */
  genderSuggested: boolean
  defaultGoalImage: string | null
}) {
  const [goalImage, setGoalImage] = useState(defaultGoalImage ?? '')
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)

  async function handleSuggest() {
    setError(null)
    setSuggestion(null)
    setSuggesting(true)
    try {
      const res = await fetch('/api/resident/suggest-goal-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender, goalImage }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || '提案の生成に失敗しました')
      }
      setSuggestion(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '提案の生成に失敗しました')
    } finally {
      setSuggesting(false)
    }
  }

  function applyText(text: string) {
    setGoalImage(text)
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">性別</label>
        <div className="flex items-center gap-2 flex-wrap">
          <select name="gender" value={gender} onChange={e => onGenderChange(e.target.value)}
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
            <option value="">未設定</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
          {genderSuggested && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
              氏名から推定した候補です。誤りがあれば修正してください
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <label className="text-xs font-medium text-gray-700">ゴール設定（ゴールのイメージ）</label>
          <button type="button" onClick={handleSuggest} disabled={suggesting || !goalImage.trim()}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {suggesting ? '生成中...' : 'AIで提案'}
          </button>
        </div>
        <textarea name="goalImage" value={goalImage} onChange={e => setGoalImage(e.target.value)} rows={3}
          placeholder="例: 家族と一緒に近所を散歩できるようになりたい"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-y" />
        <p className="text-[10px] text-gray-400 mt-1">
          まず思いつくゴールのイメージを入力してから「AIで提案」を押すと、ACPの視点でメイン・サブのゴールのイメージを提案します。
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      {suggestion && (
        <div className="bg-teal-50/60 border border-teal-200 rounded-lg p-3 flex flex-col gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-teal-800">メインのゴールのイメージ</span>
              <button type="button" onClick={() => applyText(suggestion.main)}
                className="text-[10px] px-2 py-1 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-100 transition">
                この内容にする
              </button>
            </div>
            <p className="text-sm text-gray-700 bg-white border border-teal-100 rounded-lg px-2.5 py-2">
              {suggestion.main}
            </p>
          </div>

          {suggestion.subs.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-teal-800 block mb-1">サブのゴールのイメージ</span>
              <div className="flex flex-col gap-1.5">
                {suggestion.subs.map((sub, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 bg-white border border-teal-100 rounded-lg px-2.5 py-2">
                    <p className="text-sm text-gray-700">{sub}</p>
                    <button type="button" onClick={() => applyText(sub)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-100 transition shrink-0">
                      この内容にする
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-gray-500">
            「この内容にする」を押すと上の入力欄に反映されます。そのまま使わず、ご本人の言葉に合わせて書き換えてください。
          </p>
        </div>
      )}
    </div>
  )
}
