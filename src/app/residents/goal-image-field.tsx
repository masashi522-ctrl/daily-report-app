'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

interface Suggestion {
  main: string
  subs: string[]
}

// 利用者管理の「性別」「ゴール設定」欄。
// メインのゴールのイメージとサブのゴールのイメージをそれぞれ設定でき、
// 入力内容をもとにAIが両方の候補を提案する。
// 新規登録フォームと編集フォームの両方から使う。
export default function GoalImageField({
  gender,
  onGenderChange,
  genderSuggested,
  defaultGoalImage,
  defaultSubGoalImage,
}: {
  gender: string
  onGenderChange: (gender: string) => void
  /** 氏名からAIが推定した候補が入っているとき */
  genderSuggested: boolean
  defaultGoalImage: string | null
  defaultSubGoalImage: string | null
}) {
  const [goalImage, setGoalImage] = useState(defaultGoalImage ?? '')
  const [subGoalImage, setSubGoalImage] = useState(defaultSubGoalImage ?? '')
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
        body: JSON.stringify({ gender, goalImage, subGoalImage }),
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

  // サブは1行につき1つ。すでに同じ内容が入っている場合は追加しない
  function addSub(text: string) {
    setSubGoalImage(prev => {
      const lines = prev.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.includes(text)) return prev
      return [...lines, text].join('\n')
    })
  }

  function SuggestionRow({ text }: { text: string }) {
    return (
      <div className="flex items-start justify-between gap-2 bg-white border border-teal-100 rounded-lg px-2.5 py-2">
        <p className="text-sm text-gray-700">{text}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setGoalImage(text)}
            className="text-[10px] px-2 py-1 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-100 transition">
            メインにする
          </button>
          <button type="button" onClick={() => addSub(text)}
            className="text-[10px] px-2 py-1 rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-100 transition">
            サブに追加
          </button>
        </div>
      </div>
    )
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

      <div className="border border-teal-100 rounded-lg p-3 bg-teal-50/30 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold text-teal-800">ゴール設定（ACP）</span>
          <button type="button" onClick={handleSuggest} disabled={suggesting || !goalImage.trim()}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {suggesting ? '生成中...' : 'AIで提案'}
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">メインのゴールのイメージ</label>
          <textarea name="goalImage" value={goalImage} onChange={e => setGoalImage(e.target.value)} rows={2}
            placeholder="例: 家族と一緒に近所を散歩できるようになりたい"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-y" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            サブのゴールのイメージ <span className="text-gray-400 font-normal">（1行に1つ）</span>
          </label>
          <textarea name="subGoalImage" value={subGoalImage} onChange={e => setSubGoalImage(e.target.value)} rows={3}
            placeholder="例: 友人とお茶を楽しむ時間を続けたい"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 resize-y" />
        </div>

        <p className="text-[10px] text-gray-400">
          メインのゴールのイメージを入力してから「AIで提案」を押すと、ACPの視点でメイン・サブの候補を提案します。
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {suggestion && (
          <div className="border border-teal-200 rounded-lg p-2.5 bg-white/70 flex flex-col gap-2.5">
            <div>
              <span className="text-xs font-semibold text-teal-800 block mb-1">メインのゴールのイメージ（提案）</span>
              <SuggestionRow text={suggestion.main} />
            </div>

            {suggestion.subs.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-sky-800 block mb-1">サブのゴールのイメージ（提案）</span>
                <div className="flex flex-col gap-1.5">
                  {suggestion.subs.map((sub, i) => (
                    <SuggestionRow key={i} text={sub} />
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-500">
              各候補は「メインにする」「サブに追加」でそれぞれの欄に反映できます。そのまま使わず、ご本人の言葉に合わせて書き換えてください。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
