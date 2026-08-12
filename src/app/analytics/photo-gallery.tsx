'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { uploadResidentPhoto, deleteResidentPhoto } from './photo-actions'

export interface ResidentPhoto {
  id: string
  url: string
}

const MAX_PHOTOS = 5

export default function PhotoGallery({
  residentId,
  year,
  month,
  photos,
}: {
  residentId: string
  year: number
  month: number
  photos: ResidentPhoto[]
}) {
  const [state, formAction, uploading] = useActionState(
    uploadResidentPhoto.bind(null, residentId, year, month),
    null,
  )
  const [, startDelete] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  function handleDelete(id: string) {
    setDeletingId(id)
    startDelete(async () => {
      await deleteResidentPhoto(id)
      setDeletingId(null)
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        今月の様子（写真）
        <span className="ml-2 text-xs font-normal text-gray-400">{photos.length}/{MAX_PHOTOS}枚</span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        {photos.map(photo => (
          <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(photo.id)}
              disabled={deletingId === photo.id}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition disabled:opacity-100"
            >
              {deletingId === photo.id ? '…' : '✕'}
            </button>
          </div>
        ))}
      </div>

      {photos.length < MAX_PHOTOS && (
        <form ref={formRef} action={formAction} className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png"
            required
            disabled={uploading}
            className="text-xs text-gray-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-200 file:bg-white file:text-xs file:font-medium file:cursor-pointer hover:file:border-blue-400"
          />
          <button
            type="submit"
            disabled={uploading}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
              uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {uploading ? 'アップロード中...' : '追加'}
          </button>
        </form>
      )}
      {state?.error && <p className="text-xs text-rose-600 mt-2">{state.error}</p>}
    </div>
  )
}
