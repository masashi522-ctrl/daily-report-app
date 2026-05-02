'use server'

import { supabase } from '@/lib/supabase'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import type { FoodType } from '@/types/database'

export async function addResident(formData: FormData) {
  await requireSession()

  const name = formData.get('name') as string
  const foodType = formData.get('foodType') as FoodType
  const foodRestrictions = formData.get('foodRestrictions') as string
  const specialCondition = formData.get('specialCondition') as string
  const sortOrder = parseInt(formData.get('sortOrder') as string) || 0

  if (!name) return

  await supabase.from('Resident').insert({
    id: crypto.randomUUID(),
    name,
    foodType,
    foodRestrictions: foodRestrictions || null,
    specialCondition: specialCondition || null,
    isActive: true,
    sortOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  revalidatePath('/residents')
}

export async function deleteResident(id: string) {
  await requireSession()
  await supabase.from('Resident').delete().eq('id', id)
  revalidatePath('/residents')
}

export async function toggleActive(id: string, isActive: boolean) {
  await requireSession()
  await supabase.from('Resident').update({ isActive, updatedAt: new Date().toISOString() }).eq('id', id)
  revalidatePath('/residents')
}
