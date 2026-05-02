'use client'

interface Props {
  listId: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  options: number[]
  step?: number
  min?: number
  max?: number
  className?: string
}

export default function NumInput({ listId, value, onChange, placeholder, options, step = 1, min, max, className }: Props) {
  return (
    <>
      <input
        type="number"
        list={listId}
        value={value ?? ''}
        onChange={e => onChange(e.target.value !== '' ? +e.target.value : null)}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className={className}
      />
      <datalist id={listId}>
        {options.map(v => <option key={v} value={v} />)}
      </datalist>
    </>
  )
}
