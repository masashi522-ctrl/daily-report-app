'use client'

import { deleteStaff } from './actions'

export default function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm(`${name} を削除しますか？`)) return
        await deleteStaff(id)
      }}
      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition"
    >
      削除
    </button>
  )
}
