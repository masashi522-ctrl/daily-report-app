'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

const MAX_PHOTOS_PER_MONTH = 5
const MAX_FILE_SIZE = 8 * 1024 * 1024
// PDF/Word出力（pdfkit/docx）が直接埋め込める形式のみ許可する（WEBPは非対応のため除外）
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const BUCKET_NAME = 'resident-monthly-photos'

export type PhotoActionState = { error?: string; success?: boolean } | null

export async function uploadResidentPhoto(
  residentId: string,
  year: number,
  month: number,
  prevState: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const session = await requireSession()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'ファイルを選択してください' }
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return { error: '対応していないファイル形式です（JPEG/PNGのみ）' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'ファイルサイズは8MBまでにしてください' }
  }

  const { count } = await supabase
    .from('ResidentMonthlyPhoto')
    .select('id', { count: 'exact', head: true })
    .eq('residentId', residentId)
    .eq('year', year)
    .eq('month', month)

  if ((count ?? 0) >= MAX_PHOTOS_PER_MONTH) {
    return { error: `写真は1ヶ月あたり最大${MAX_PHOTOS_PER_MONTH}枚までです` }
  }

  const photoId = crypto.randomUUID()
  const storagePath = `${session.facilityId}/${residentId}/${year}-${String(month).padStart(2, '0')}/${photoId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return { error: `アップロードに失敗しました: ${uploadError.message}` }
  }

  const { error: insertError } = await supabase.from('ResidentMonthlyPhoto').insert({
    id: photoId,
    facilityId: session.facilityId,
    residentId,
    year,
    month,
    storagePath,
    caption: null,
    sortOrder: count ?? 0,
  })

  if (insertError) {
    await supabase.storage.from(BUCKET_NAME).remove([storagePath])
    return { error: `保存に失敗しました: ${insertError.message}` }
  }

  revalidatePath('/analytics')
  return { success: true }
}

export async function deleteResidentPhoto(photoId: string): Promise<PhotoActionState> {
  const session = await requireSession()

  const { data: photo } = await supabase
    .from('ResidentMonthlyPhoto')
    .select('id, storagePath, facilityId')
    .eq('id', photoId)
    .eq('facilityId', session.facilityId)
    .maybeSingle()

  if (!photo) {
    return { error: '写真が見つかりません' }
  }

  await supabase.storage.from(BUCKET_NAME).remove([photo.storagePath])
  await supabase.from('ResidentMonthlyPhoto').delete().eq('id', photoId).eq('facilityId', session.facilityId)

  revalidatePath('/analytics')
  return { success: true }
}
