'use client'

interface Props {
  name: string
  defaultValue: string
  options: readonly string[]
  placeholder?: string
}

const CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400'

// 計画書の作成者・説明者の欄。氏名の一覧がある施設は選択式、無い施設は自由入力にする。
export default function StaffNameSelect({ name, defaultValue, options, placeholder }: Props) {
  if (options.length === 0) {
    return <input type="text" name={name} defaultValue={defaultValue} placeholder={placeholder} className={CLASS} />
  }

  // 一覧に無い氏名が既に保存されている場合は選択肢に残す（開いただけで別人に書き換わらないように）
  const choices = defaultValue && !options.includes(defaultValue) ? [...options, defaultValue] : options

  return (
    <select name={name} defaultValue={defaultValue} className={CLASS}>
      <option value="">未選択</option>
      {choices.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  )
}
