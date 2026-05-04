'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { toFurigana } from '@/lib/furigana'
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
  const bathingDays    = (formData.getAll('bathingDays')    as string[]).join(',')
  const trainingDays   = (formData.getAll('trainingDays')   as string[]).join(',')

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
    bathingDays:    bathingDays    || null,
    trainingDays:   trainingDays   || null,
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
  const bathingDays    = (formData.getAll('bathingDays')    as string[]).join(',')
  const trainingDays   = (formData.getAll('trainingDays')   as string[]).join(',')

  if (!name) return

  await supabase.from('Resident').update({
    name,
    furigana: furigana || null,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    sortOrder,
    attendanceDays: attendanceDays || null,
    bathingDays:    bathingDays    || null,
    trainingDays:   trainingDays   || null,
    updatedAt: new Date().toISOString(),
  }).eq('id', id)

  revalidatePath('/residents')
  redirect('/residents')
}

export async function generateFurigana(name: string): Promise<string> {
  if (!name.trim()) return ''
  try {
    return await toFurigana(name.trim())
  } catch {
    return ''
  }
}

export async function generateAllFurigana(): Promise<{ updated: number; errors: number }> {
  await requireSession()
  const { data: residents } = await supabase
    .from('Resident')
    .select('id, name, furigana')
    .is('furigana', null)

  if (!residents || residents.length === 0) return { updated: 0, errors: 0 }

  let updated = 0
  let errors = 0

  for (const r of residents) {
    try {
      const furigana = await toFurigana(r.name)
      if (furigana) {
        await supabase.from('Resident').update({ furigana, updatedAt: new Date().toISOString() }).eq('id', r.id)
        updated++
      }
    } catch {
      errors++
    }
  }

  revalidatePath('/residents')
  return { updated, errors }
}

export async function toggleActive(id: string, isActive: boolean) {
  await requireSession()
  await supabase.from('Resident').update({ isActive, updatedAt: new Date().toISOString() }).eq('id', id)
  revalidatePath('/residents')
}
