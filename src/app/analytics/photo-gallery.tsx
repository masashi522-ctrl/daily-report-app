'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { uploadResidentPhoto, deleteResidentPhoto } from './photo-actions'

export interface ResidentPhoto {
  id: string
  url: string
}

const MAX_PHOTOS = 5
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

// 元画像（スマホ撮影で数MB〜)のまま保存すると、印刷（特に物理プリンター）で
// 高解像度画像の展開に失敗することがあるため、アップロード前に縮小・再圧縮する
async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  let { width, height } = bitmap
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

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
  const [resizing, setResizing] = useState(false)
  const [resizeError, setResizeError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResizeError(null)
    setResizing(true)
    try {
      const resized = await resizeImage(file)
      const fd = new FormData()
      fd.set('file', resized)
      formAction(fd)
    } catch {
      setResizeError('画像の処理に失敗しました。別の画像でお試しください。')
    } finally {
      setResizing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const busy = uploading || resizing

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
        <form ref={formRef} className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png"
            disabled={busy}
            onChange={handleFileChange}
            className="text-xs text-gray-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-200 file:bg-white file:text-xs file:font-medium file:cursor-pointer hover:file:border-blue-400"
          />
          {busy && (
            <span className="text-xs text-gray-500">{resizing ? '画像を処理中...' : 'アップロード中...'}</span>
          )}
        </form>
      )}
      {(state?.error || resizeError) && <p className="text-xs text-rose-600 mt-2">{state?.error || resizeError}</p>}
    </div>
  )
}
