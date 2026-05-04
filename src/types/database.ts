export type Role = 'ADMIN' | 'STAFF'
export type FoodType = 'REGULAR' | 'LOW_SALT' | 'SOFT' | 'MINCED' | 'BLENDED' | 'PORRIDGE' | 'MANNAN' | 'BREAD' | 'BLENDED_PORRIDGE'
export type BathingStatus = 'DONE' | 'NOT_DONE' | 'NOT_APPLICABLE'

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  REGULAR: '常食',
  LOW_SALT: '減塩',
  SOFT: 'ソフト',
  MINCED: 'きざみ',
  BLENDED: 'ミキサー',
  PORRIDGE: 'おかゆ',
  MANNAN: 'マンナン',
  BREAD: 'パン',
  BLENDED_PORRIDGE: 'ミキサー粥',
}

export const BATHING_LABELS: Record<BathingStatus, string> = {
  DONE: '○',
  NOT_DONE: '×',
  NOT_APPLICABLE: '-',
}

export interface Staff {
  id: string
  name: string
  email: string
  password: string
  role: Role
  createdAt: string
  updatedAt: string
}

export interface Resident {
  id: string
  name: string
  furigana: string | null
  foodType: string
  foodRestrictions: string | null
  specialCondition: string | null
  isActive: boolean
  sortOrder: number
  attendanceDays: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyRecord {
  id: string
  date: string
  residentId: string
  staffId: string | null
  bpSystolic: number | null
  bpDiastolic: number | null
  bpSystolicPm: number | null
  bpDiastolicPm: number | null
  pulse: number | null
  pulsePm: number | null
  tempMorning: number | null
  tempAfternoon: number | null
  bathing: BathingStatus
  mealMainFood: number | null
  mealSideFood: number | null
  fluidIntakeAm: number | null
  fluidIntakePm: number | null
  medicationMorning: boolean
  medicationBeforeLunch: boolean
  medicationAfterLunch: boolean
  medicationEvening: boolean
  medicationNote: string | null
  functionalTrainingStart: string | null
  functionalTrainingEnd: string | null
  oralCare: boolean
  oralCareNote: string | null
  spo2Before: number | null
  spo2After: number | null
  weight: number | null
  eyeDrops: string | null
  insulin: string | null
  specialNotes: string | null
  // 入浴詳細
  bathingSkipReason: string | null
  bathingSkipDetail: string | null
  bathingNote: string | null
  // 機能訓練
  trainingDone: boolean
  trainingSkipReason: string | null
  trainingSkipDetail: string | null
  trainingNote: string | null
  createdAt: string
  updatedAt: string
}

export interface Database {
  public: {
    Tables: {
      Staff: { Row: Staff; Insert: Omit<Staff, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<Staff> }
      Resident: { Row: Resident; Insert: Omit<Resident, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<Resident> }
      DailyRecord: { Row: DailyRecord; Insert: Omit<DailyRecord, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<DailyRecord> }
    }
  }
}
