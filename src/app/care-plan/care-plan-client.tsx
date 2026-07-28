'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Download, Camera, Loader2, Sparkles } from 'lucide-react'
import { saveCarePlan } from './actions'
import { CARE_LEVEL_OPTIONS, type CarePlan, type CarePlanGoal } from '@/types/database'
import { mergeGoalsBySameIssue } from '@/lib/care-plan-goals'

interface Resident { id: string; name: string; furigana: string | null; careLevel: string | null }

interface Props {
  residents: Resident[]
  selectedResidentId: string
  selectedResident: Resident | null
  plan: CarePlan | null
  facilityName: string
}

const EMPTY_GOAL: CarePlanGoal = { issue: '', longTermGoal: '', shortTermGoal: '', serviceContent: '', frequency: '' }

// スキャン結果が全角数字（要介護２ 等）で来ても選択肢と一致するよう正規化する
function normalizeCareLevel(v: string | null | undefined): string {
  if (!v) return ''
  const halfWidth = v.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim()
  return (CARE_LEVEL_OPTIONS as readonly string[]).includes(halfWidth) ? halfWidth : ''
}

interface ScanResult {
  planDate: string
  staffName: string
  birthDate: string
  careLevel: string
  needsAnalysis: string
  supportPolicy: string
  goalImage: string
  goals: CarePlanGoal[]
  monitoringDate: string
  evaluationPeriodStart: string
  evaluationPeriodEnd: string
  evaluationContent: string
  explanationDate: string
  explainerName: string
  familyConfirmation: string
  proxySigner: string
}

const SCAN_SCALAR_FIELDS: (keyof Omit<ScanResult, 'goals'>)[] = [
  'planDate', 'staffName', 'birthDate', 'careLevel', 'needsAnalysis', 'supportPolicy', 'goalImage',
  'monitoringDate', 'evaluationPeriodStart', 'evaluationPeriodEnd', 'evaluationContent',
  'explanationDate', 'explainerName', 'familyConfirmation', 'proxySigner',
]

const GOJUUON_ROWS = [
  { label: 'あ', chars: 'あいうえおアイウエオ' },
  { label: 'か', chars: 'かきくけこカキクケコがぎぐげごガギグゲゴ' },
  { label: 'さ', chars: 'さしすせそサシスセソざじずぜぞザジズゼゾ' },
  { label: 'た', chars: 'たちつてとタチツテトだぢづでどダヂヅデド' },
  { label: 'な', chars: 'なにぬねのナニヌネノ' },
  { label: 'は', chars: 'はひふへほハヒフヘホばびぶべぼバビブベボぱぴぷぺぽパピプペポ' },
  { label: 'ま', chars: 'まみむめもマミムメモ' },
  { label: 'や', chars: 'やゆよヤユヨ' },
  { label: 'ら', chars: 'らりるれろラリルレロ' },
  { label: 'わ', chars: 'わをんワヲン' },
]

export default function CarePlanClient({ residents, selectedResidentId, selectedResident, plan, facilityName }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(saveCarePlan.bind(null, selectedResidentId), null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [effectivePlan, setEffectivePlan] = useState<CarePlan | null>(plan)
  const [formKey, setFormKey] = useState(0)
  const [goals, setGoals] = useState<CarePlanGoal[]>(
    plan?.goals && plan.goals.length > 0 ? plan.goals : [{ ...EMPTY_GOAL }],
  )
  const [goalImageText, setGoalImageText] = useState(plan?.goalImage ?? '')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanApplied, setScanApplied] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestingServiceIndex, setSuggestingServiceIndex] = useState<number | null>(null)
  const [suggestServiceError, setSuggestServiceError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const needsAnalysisRef = useRef<HTMLTextAreaElement>(null)
  const supportPolicyRef = useRef<HTMLTextAreaElement>(null)
  const careLevelRef = useRef<HTMLSelectElement>(null)

  const [searchText, setSearchText] = useState('')
  const [appliedText, setAppliedText] = useState('')
  const [gojuuonRow, setGojuuonRow] = useState<string | null>(null)

  useEffect(() => {
    if (state?.success) setSavedAt(new Date().toLocaleTimeString('ja-JP'))
  }, [state])

  useEffect(() => {
    setSavedAt(null)
    setEffectivePlan(plan)
    setGoals(plan?.goals && plan.goals.length > 0 ? plan.goals : [{ ...EMPTY_GOAL }])
    setGoalImageText(plan?.goalImage ?? '')
    setScanError(null)
    setScanApplied(false)
    setSuggestError(null)
    setFormKey(k => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResidentId])

  function updateGoal(index: number, field: keyof CarePlanGoal, value: string) {
    setGoals(prev => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)))
  }

  function addGoal() {
    setGoals(prev => [...prev, { ...EMPTY_GOAL }])
  }

  function removeGoal(index: number) {
    setGoals(prev => prev.filter((_, i) => i !== index))
  }

  async function handleScanFiles(files: File[]) {
    setScanError(null)
    setScanApplied(false)
    setScanning(true)
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      fd.append('facilityName', facilityName)
      const res = await fetch('/api/care-plan/scan', { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || '読み取りに失敗しました')
      }
      const data: ScanResult = await res.json()

      // 既存の内容を残しつつ、今回読み取れた項目だけを上書きする（複数回の読み込みを合成する）
      setEffectivePlan(prev => {
        const merged: CarePlan = { ...(prev ?? ({} as CarePlan)) }
        for (const field of SCAN_SCALAR_FIELDS) {
          if (data[field]) merged[field] = data[field]
        }
        return merged
      })
      setGoals(prev => {
        const meaningfulPrev = prev.filter(g => g.issue || g.longTermGoal || g.shortTermGoal || g.serviceContent || g.frequency)
        const combined = mergeGoalsBySameIssue([...meaningfulPrev, ...(data.goals ?? [])])
        return combined.length > 0 ? combined : [{ ...EMPTY_GOAL }]
      })
      setGoalImageText(prev => prev || data.goalImage)
      setFormKey(k => k + 1)
      setScanApplied(true)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : '読み取りに失敗しました')
    } finally {
      setScanning(false)
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) handleScanFiles(files)
  }

  async function handleSuggestGoalImage() {
    setSuggestError(null)
    setSuggesting(true)
    try {
      const res = await fetch('/api/care-plan/suggest-goal-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needsAnalysis: needsAnalysisRef.current?.value ?? '',
          supportPolicy: supportPolicyRef.current?.value ?? '',
          careLevel: careLevelRef.current?.value ?? '',
          goals,
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || '提案の生成に失敗しました')
      }
      const data = await res.json()
      setGoalImageText(data.suggestion ?? '')
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : '提案の生成に失敗しました')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSuggestServiceContent(index: number) {
    setSuggestServiceError(null)
    setSuggestingServiceIndex(index)
    try {
      const g = goals[index]
      const res = await fetch('/api/care-plan/suggest-service-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue: g.issue,
          longTermGoal: g.longTermGoal,
          shortTermGoal: g.shortTermGoal,
          frequency: g.frequency,
          currentServiceContent: g.serviceContent,
          careLevel: careLevelRef.current?.value ?? '',
          facilityName,
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || '生成に失敗しました')
      }
      const data = await res.json()
      updateGoal(index, 'serviceContent', data.suggestion ?? '')
    } catch (e) {
      setSuggestServiceError(e instanceof Error ? e.message : '生成に失敗しました')
    } finally {
      setSuggestingServiceIndex(null)
    }
  }

  const filteredResidents = residents.filter(r => {
    const matchName = !appliedText ||
      r.name.includes(appliedText) ||
      (r.furigana ?? '').includes(appliedText)
    if (!matchName) return false
    if (!gojuuonRow) return true
    const searchChar = (r.furigana ?? r.name)[0]
    const row = GOJUUON_ROWS.find(g => g.label === gojuuonRow)
    return row ? row.chars.includes(searchChar) : true
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">介護計画書</h2>
        <span className="text-sm text-gray-500">対象: {residents.length}名</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 利用者選択 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2">
            {/* 検索バー */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setAppliedText(searchText)}
                placeholder="名前で検索..."
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-teal-400"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={() => setAppliedText(searchText)}
                className="px-2.5 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 whitespace-nowrap"
              >検索</button>
              {appliedText && (
                <button onClick={() => { setSearchText(''); setAppliedText('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1.5 rounded-lg hover:bg-gray-100">
                  ✕
                </button>
              )}
            </div>
            {/* 50音タブ */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setGojuuonRow(null)}
                className={`text-[11px] px-1.5 py-0.5 rounded border font-medium transition ${
                  gojuuonRow === null
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'
                }`}
              >全</button>
              {GOJUUON_ROWS.map(row => (
                <button key={row.label}
                  onClick={() => setGojuuonRow(gojuuonRow === row.label ? null : row.label)}
                  className={`text-[11px] px-1.5 py-0.5 rounded border transition ${
                    gojuuonRow === row.label
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400 hover:text-teal-600'
                  }`}
                >{row.label}</button>
              ))}
            </div>

            <div className="flex flex-col gap-1 max-h-[55vh] overflow-y-auto">
              {residents.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">利用者が登録されていません</p>
              )}
              {residents.length > 0 && filteredResidents.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">該当する利用者がいません</p>
              )}
              {filteredResidents.map(r => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/care-plan?resident=${r.id}`)}
                  className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                    r.id === selectedResidentId
                      ? 'bg-teal-600 text-white font-medium'
                      : 'text-gray-700 hover:bg-teal-50'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 計画書フォーム */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {!selectedResident ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
              左の一覧から利用者を選択してください
            </div>
          ) : (
            <>
              {/* スキャン・写真読み込み */}
              <div className="bg-white rounded-xl border border-teal-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-teal-800">ケアプランをスキャン・写真・PDFで読み込む</p>
                    <p className="text-xs text-gray-500 mt-0.5">紙の計画書の撮影・スキャン画像、またはPDFデータを読み込ませると、内容を自動で読み取り下のフォームに反映します（複数ファイルの同時選択可）</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      className="hidden"
                      onChange={onFileSelected}
                    />
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50"
                    >
                      {scanning ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                      {scanning ? '読み取り中...' : '写真・PDFを選択（複数可）'}
                    </button>
                  </div>
                </div>
                {scanError && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{scanError}</div>
                )}
                {scanApplied && !scanning && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                    読み取り内容を下のフォームに反映しました。内容を確認して「保存する」を押してください。
                  </div>
                )}
              </div>

              <form key={formKey} action={formAction} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-5">
              <div className="text-center border-b border-gray-100 pb-3 relative">
                <h3 className="font-bold text-gray-800 text-lg tracking-widest">通所介護計画書</h3>
                {effectivePlan?.updatedAt && (
                  <span className="text-xs text-gray-400">
                    最終更新: {new Date(effectivePlan.updatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
                {effectivePlan && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <a
                      href={`/api/care-plan/export?residentId=${selectedResidentId}`}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition"
                    >
                      <Download size={13} /> Excelでダウンロード
                    </a>
                  </div>
                )}
              </div>

              {/* ヘッダー: 作成年月日・作成者・利用者氏名・生年月日・要介護 */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成年月日</label>
                  <input type="date" name="planDate" defaultValue={effectivePlan?.planDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">作成者</label>
                  <input type="text" name="staffName" defaultValue={effectivePlan?.staffName ?? ''}
                    placeholder="担当者名"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">生年月日</label>
                  <input type="date" name="birthDate" defaultValue={effectivePlan?.birthDate ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">要介護</label>
                  <select ref={careLevelRef} name="careLevel" defaultValue={normalizeCareLevel(effectivePlan?.careLevel) || selectedResident.careLevel || ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                    <option value="">未設定</option>
                    {CARE_LEVEL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">利用者氏名: {selectedResident.name} 様</p>

              <div>
                <label className="text-xs font-semibold text-teal-800 block mb-1">
                  【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】
                </label>
                <textarea ref={needsAnalysisRef} name="needsAnalysis" defaultValue={effectivePlan?.needsAnalysis ?? ''} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-teal-800 block mb-1">【総合的な援助の方針】</label>
                <textarea ref={supportPolicyRef} name="supportPolicy" defaultValue={effectivePlan?.supportPolicy ?? ''} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-teal-800">【ゴールのイメージ】</label>
                  <button type="button" onClick={handleSuggestGoalImage} disabled={suggesting}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium disabled:opacity-50">
                    {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {suggesting ? '生成中...' : 'AIで提案'}
                  </button>
                </div>
                <textarea name="goalImage" value={goalImageText} onChange={e => setGoalImageText(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
                {suggestError && (
                  <p className="text-xs text-red-600 mt-1">{suggestError}</p>
                )}
              </div>

              {/* 援助目標テーブル */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-teal-800">【援助目標】</label>
                  <button type="button" onClick={addGoal}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium">
                    <Plus size={13} /> 行を追加
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_0.6fr_auto] gap-2 px-1">
                    <span className="text-[10px] text-gray-400">解決すべき課題（ニーズ）</span>
                    <span className="text-[10px] text-gray-400">長期目標</span>
                    <span className="text-[10px] text-gray-400">短期目標</span>
                    <span className="text-[10px] text-gray-400">サービス内容（AI生成可）</span>
                    <span className="text-[10px] text-gray-400">頻度</span>
                    <span />
                  </div>
                  {goals.map((g, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_0.6fr_auto] gap-2 p-2 bg-teal-50/40 rounded-lg border border-teal-100 items-start">
                      <textarea name="goalIssue" value={g.issue} rows={3}
                        onChange={e => updateGoal(i, 'issue', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400 resize-y" />
                      <textarea name="goalLongTerm" value={g.longTermGoal} rows={3}
                        onChange={e => updateGoal(i, 'longTermGoal', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400 resize-y" />
                      <textarea name="goalShortTerm" value={g.shortTermGoal} rows={3}
                        onChange={e => updateGoal(i, 'shortTermGoal', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400 resize-y" />
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => handleSuggestServiceContent(i)}
                          disabled={suggestingServiceIndex === i}
                          className="self-start flex items-center gap-0.5 text-[10px] text-teal-600 hover:text-teal-800 font-medium disabled:opacity-50">
                          {suggestingServiceIndex === i ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          AI生成
                        </button>
                        <textarea name="goalService" value={g.serviceContent} rows={3}
                          onChange={e => updateGoal(i, 'serviceContent', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400 resize-y" />
                      </div>
                      <input type="text" name="goalFrequency" value={g.frequency}
                        onChange={e => updateGoal(i, 'frequency', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                      <button type="button" onClick={() => removeGoal(i)} disabled={goals.length === 1}
                        className="flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-30 px-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {suggestServiceError && (
                  <p className="text-xs text-red-600 mt-1">{suggestServiceError}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">「AI生成」は、その行の課題・目標・現在のサービス内容をもとに、具体的なケア内容を提案します（既存の内容は上書きされます）。</p>
              </div>

              {/* サービス達成状況 */}
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 flex flex-col gap-3">
                <label className="text-xs font-semibold text-sky-800">【サービス達成状況】</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">モニタリング日</label>
                    <input type="date" name="monitoringDate" defaultValue={effectivePlan?.monitoringDate ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">評価期間（開始）</label>
                    <input type="date" name="evaluationPeriodStart" defaultValue={effectivePlan?.evaluationPeriodStart ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">評価期間（終了）</label>
                    <input type="date" name="evaluationPeriodEnd" defaultValue={effectivePlan?.evaluationPeriodEnd ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">評価内容</label>
                  <textarea name="evaluationContent" defaultValue={effectivePlan?.evaluationContent ?? ''} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 resize-none" />
                </div>
              </div>

              {/* 説明・同意 */}
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-3">
                <p className="text-xs text-gray-600">上記の通所介護計画によりサービス提供を行います。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">説明日</label>
                    <input type="date" name="explanationDate" defaultValue={effectivePlan?.explanationDate ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">説明者</label>
                    <input type="text" name="explainerName" defaultValue={effectivePlan?.explainerName ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500">事業所名称：{facilityName}</p>
                <p className="text-xs text-gray-600">上記計画の内容について説明を受け同意し、交付されました。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">利用者同意署名欄</label>
                    <input type="text" name="familyConfirmation" defaultValue={effectivePlan?.familyConfirmation ?? ''}
                      placeholder="例: 本人・家族へ説明し同意を得た（同意日等）"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">代筆者署名欄（続柄）</label>
                    <input type="text" name="proxySigner" defaultValue={effectivePlan?.proxySigner ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
                  </div>
                </div>
              </div>

              {state?.error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{state.error}</div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={pending}
                  className="bg-teal-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50">
                  {pending ? '保存中...' : '保存する'}
                </button>
                {savedAt && <span className="text-xs text-emerald-600">{savedAt} に保存しました</span>}
              </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
