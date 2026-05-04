'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ResidentFormState = { error: string } | null

export async function addResident(prevState: ResidentFormState, formData: FormData): Promise<ResidentFormState> {
  await requireSession()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: '名前は必須です' }

  const furigana = (formData.get('furigana') as string)?.trim()
  const foodType = (formData.getAll('foodType') as string[]).join(',')
  const foodRestrictions = formData.get('foodRestrictions') as string
  const specialCondition = formData.get('specialCondition') as string
  const sortOrder = parseInt(formData.get('sortOrder') as string) || 0
  const attendanceDays = (formData.getAll('attendanceDays') as string[]).join(',')

  const { error } = await supabase.from('Resident').insert({
    id: crypto.randomUUID(),
    name,
    furigana: furigana || null,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    isActive: true,
    sortOrder,
    attendanceDays: attendanceDays || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (error) return { error: `登録に失敗しました: ${error.message}` }

  revalidatePath('/residents')
  redirect('/residents')
}

export async function deleteResident(id: string) {
  await requireSession()
  await supabase.from('Resident').delete().eq('id', id)
  revalidatePath('/residents')
}

export async function updateResident(id: string, formData: FormData) {
  await requireSession()

  const name = formData.get('name') as string
  const furigana = (formData.get('furigana') as string)?.trim()
  const foodType = (formData.getAll('foodType') as string[]).join(',')
  const foodRestrictions = formData.get('foodRestrictions') as string
  const specialCondition = formData.get('specialCondition') as string
  const sortOrder = parseInt(formData.get('sortOrder') as string) || 0
  const attendanceDays = (formData.getAll('attendanceDays') as string[]).join(',')

  if (!name) return

  await supabase.from('Resident').update({
    name,
    furigana: furigana || null,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    sortOrder,
    attendanceDays: attendanceDays || null,
    updatedAt: new Date().toISOString(),
  }).eq('id', id)

  revalidatePath('/residents')
  redirect('/residents')
}

export async function toggleActive(id: string, isActive: boolean) {
  await requireSession()
  await supabase.from('Resident').update({ isActive, updatedAt: new Date().toISOString() }).eq('id', id)
  revalidatePath('/residents')
}
