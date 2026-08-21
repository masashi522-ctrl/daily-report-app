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

export interface Facility {
  id: string
  name: string
  facilityCode: string
  slug: string | null
  capacity: number | null
  capacityByCategory: Partial<Record<typeof SERVICE_TIME_CATEGORIES[number], number>> | null
  createdAt: string
  updatedAt: string
}

export interface Staff {
  id: string
  name: string
  email: string
  password: string
  role: Role
  facilityId: string | null
  createdAt: string
  updatedAt: string
}

export const BATHING_CARE_ITEMS = [
  { key: 'EDEMA',           label: '浮腫（備考欄に記載）' },
  { key: 'SHAVING',         label: '髭剃り' },
  { key: 'CLOTHING_CHANGE', label: '着替え' },
  { key: 'REHA_PAN',        label: 'リハパン交換' },
  { key: 'PAD_CHANGE',      label: 'パット交換' },
  { key: 'GAUZE_CHANGE',    label: 'ガーゼ交換' },
  { key: 'OINTMENT',        label: '軟膏塗布' },
  { key: 'COMPRESS_CHANGE', label: '湿布交換' },
] as const

export const BATHING_SPECIAL_ITEMS = [
  { key: 'BATH_BENCH',       label: '浴槽台' },
  { key: 'RIGHT_BATH',       label: '右側浴槽' },
  { key: 'LEFT_BATH',        label: '左側浴槽' },
  { key: 'PERSONAL_ITEMS',   label: '本人持参物品あり' },
  { key: 'SHOWER_REQUESTED', label: '本人希望でシャワー浴' },
  { key: 'SPO2_CHECK',       label: '入浴前後のSpO2（備考欄に記載）' },
] as const

export const CARE_LEVEL_OPTIONS = [
  '要支援1', '要支援2',
  '要介護1', '要介護2', '要介護3', '要介護4', '要介護5',
] as const

export const SERVICE_START_TIMES = (() => {
  const times: string[] = []
  for (let h = 9; h <= 17; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 17 && m > 0) break
      if (h === 9 && m < 30) continue
      times.push(`${h}:${String(m).padStart(2, '0')}`)
    }
  }
  return times
})()

export const SERVICE_TIME_CATEGORIES = ['3-4', '4-5', '5-6', '6-7', '7-8', '8-9'] as const

// 排便の記録項目
export const BOWEL_AMOUNT_OPTIONS = ['少量', '片手', '両手', '多量'] as const
export const BOWEL_QUALITY_OPTIONS = ['コロ便', '硬便', '普通', '軟便', '水様便'] as const

export interface HospitalizationPeriod {
  admissionDate: string
  dischargeDate: string | null
}

export interface Resident {
  id: string
  name: string
  furigana: string | null
  facilityId: string | null
  foodType: string
  foodRestrictions: string | null
  specialCondition: string | null
  isActive: boolean
  /** 旧「表示順」。現在は使用しておらず、一覧はすべてふりがな順に統一している */
  sortOrder: number
  attendanceDays: string | null
  bathingDays: string | null
  trainingDays: string | null
  weightMeasureEveryVisit: boolean
  bathingCareItems: string | null
  bathingSpecialItems: string | null
  bathingSpecialFreeText: string | null
  careLevel: string | null
  serviceStartTime: string | null
  serviceEndTime: string | null
  serviceTimeCategory: string | null
  serviceStartDate: string | null
  serviceEndDate: string | null
  hospitalizations: HospitalizationPeriod[] | null
  gender: string | null
  /** ACPの取り組みで設定するメインのゴールのイメージ */
  goalImage: string | null
  /** サブのゴールのイメージ。1行に1つ */
  subGoalImage: string | null
  /** ご家族へのLINE連絡を有効にするか。オフなら何も送信しない */
  familyContactEnabled: boolean
  /** 連絡帳を共有するか。有効化と両方オンのときだけ送信する */
  shareDailyReport: boolean
  /** 活動写真を共有するか。有効化と両方オンのときだけ送信する */
  shareActivityPhoto: boolean
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
  medicationBeforeEvening: boolean
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
  /** その日の様子。連絡帳のAI文章の材料にも使う */
  dailyNote: string | null
  /** 排便の量（少量・片手・両手・多量） */
  bowelAmount: string | null
  /** 排便の質（コロ便・硬便・普通・軟便・水様便） */
  bowelQuality: string | null
  // 出欠
  isAbsent: boolean
  absenceReason: string | null
  // 入浴詳細
  bathingSkipReason: string | null
  bathingSkipDetail: string | null
  bathingNote: string | null
  bathingCareChecks: string | null
  // 機能訓練
  trainingDone: boolean
  trainingSkipReason: string | null
  trainingSkipDetail: string | null
  trainingNote: string | null
  // 臨時利用
  isTemporaryAttendance: boolean
  createdAt: string
  updatedAt: string
}

export const ADL_INDEPENDENCE_LEVEL_OPTIONS = [
  '自立', 'J1', 'J2', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2',
] as const

export const DEMENTIA_INDEPENDENCE_LEVEL_OPTIONS = [
  '自立', 'Ⅰ', 'Ⅱa', 'Ⅱb', 'Ⅲa', 'Ⅲb', 'Ⅳ', 'M',
] as const

export interface CarePlanGoal {
  issue: string
  longTermGoal: string
  shortTermGoal: string
  serviceContent: string
  frequency: string
  // 介護予防通所介護計画書（要支援）の援助目標欄で使う項目。
  // 様式が「目標／支援のポイント／サービス内容／頻度／期間」のため、
  // 通常様式と同じJSONカラムに追加項目として保存する。
  goal?: string
  supportPoint?: string
  period?: string
}

// 介護予防通所介護計画書の「必要な事業プログラム」の選択肢
export const PREVENTION_PROGRAMS = [
  '運動器の機能向上',
  '栄養改善',
  '口腔機能の向上',
  '閉じこもり予防',
  '物忘れ予防',
  'うつ予防',
] as const

// 個別機能訓練計画書の「リハビリ目標」表の1行分。CarePlanGoalと同じ形。
export type TrainingPlanGoal = CarePlanGoal

export interface TrainingPlan {
  id: string
  residentId: string
  facilityId: string | null
  planDate: string | null
  previousPlanDate: string | null
  firstPlanDate: string | null
  version: number
  staffName: string | null
  gender: string | null
  birthDate: string | null
  careLevel: string | null
  adlIndependenceLevel: string | null
  dementiaIndependenceLevel: string | null
  needsAnalysis: string | null
  supportPolicy: string | null
  goalImage: string | null
  socialParticipation: string | null
  housingSituation: string | null
  goals: TrainingPlanGoal[] | null
  diseaseName: string | null
  onsetDate: string | null
  recentAdmissionDate: string | null
  recentDischargeDate: string | null
  trainingPrecautions: string | null
  monitoringDate: string | null
  monitoringPeriod: string | null
  monitoringContent: string | null
  explanationDate: string | null
  explainerName: string | null
  familySignature: string | null
  proxySignature: string | null
  createdAt: string
  updatedAt: string
}

export interface CarePlan {
  id: string
  residentId: string
  facilityId: string | null
  planDate: string | null
  staffName: string | null
  birthDate: string | null
  careLevel: string | null
  needsAnalysis: string | null
  supportPolicy: string | null
  goalImage: string | null
  goals: CarePlanGoal[] | null
  monitoringDate: string | null
  evaluationPeriodStart: string | null
  evaluationPeriodEnd: string | null
  evaluationContent: string | null
  explanationDate: string | null
  explainerName: string | null
  familyConfirmation: string | null
  proxySigner: string | null
  // ── ここから下は介護予防通所介護計画書（要支援）専用の項目 ──
  gender: string | null
  version: number | null
  dailyGoal: string | null
  yearlyGoal: string | null
  healthNotes: string | null
  /** 必要な事業プログラム。選択された項目をカンマ区切りで保存する */
  programs: string | null
  serviceStartTime: string | null
  serviceEndTime: string | null
  createdAt: string
  updatedAt: string
}

// 計画書を新しい版として保存したときの控え。snapshotに保存時点のCarePlan全体を持つ
export interface CarePlanHistoryEntry {
  id: string
  residentId: string
  facilityId: string | null
  version: number
  /** 'standard' = 通所介護計画書 / 'prevention' = 介護予防通所介護計画書 */
  planType: string
  planDate: string | null
  snapshot: CarePlan
  createdAt: string
}

export interface ResidentMonthlyPhoto {
  id: string
  facilityId: string
  residentId: string
  year: number
  month: number
  storagePath: string
  caption: string | null
  sortOrder: number
  createdAt: string
}

export const FAMILY_RELATIONSHIPS = [
  '長男', '長女', '次男', '次女', '三男', '三女',
  '夫', '妻', '孫', '兄', '姉', '弟', '妹', '甥', '姪', 'その他',
] as const
export type FamilyRelationship = typeof FAMILY_RELATIONSHIPS[number]

/** LINEでの連絡先となるご家族 */
export interface FamilyContact {
  id: string
  facilityId: string
  residentId: string
  name: string
  relationship: string | null
  /** 検索用のLINE ID。台帳としての控えで、送信には使えない */
  lineId: string | null
  /** 友だち追加時に発行される内部ユーザーID。実際の送信先 */
  lineUserId: string | null
  phone: string | null
  isActive: boolean
  /** lineUserId が紐づいた日時。未連携なら null */
  linkedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 友だち追加をご家族に紐づけるための連携コード */
export interface FamilyLinkCode {
  code: string
  familyContactId: string
  facilityId: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

export type FamilyMessageKind = 'REPORT' | 'PHOTO'
export type FamilyMessageStatus = 'SENT' | 'FAILED'

export interface FamilyMessageLog {
  id: string
  facilityId: string
  residentId: string
  familyContactId: string
  date: string
  kind: FamilyMessageKind
  status: FamilyMessageStatus
  error: string | null
  sentAt: string
}

export interface Database {
  public: {
    Tables: {
      Staff: { Row: Staff; Insert: Omit<Staff, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<Staff> }
      Resident: { Row: Resident; Insert: Omit<Resident, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<Resident> }
      DailyRecord: { Row: DailyRecord; Insert: Omit<DailyRecord, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<DailyRecord> }
      TrainingPlan: { Row: TrainingPlan; Insert: Omit<TrainingPlan, 'createdAt' | 'updatedAt'>; Update: Partial<TrainingPlan> }
      CarePlan: { Row: CarePlan; Insert: Omit<CarePlan, 'createdAt' | 'updatedAt'>; Update: Partial<CarePlan> }
      ResidentMonthlyPhoto: { Row: ResidentMonthlyPhoto; Insert: Omit<ResidentMonthlyPhoto, 'id' | 'createdAt'>; Update: Partial<ResidentMonthlyPhoto> }
      FamilyContact: { Row: FamilyContact; Insert: Omit<FamilyContact, 'id' | 'createdAt' | 'updatedAt'>; Update: Partial<FamilyContact> }
      FamilyLinkCode: { Row: FamilyLinkCode; Insert: Omit<FamilyLinkCode, 'createdAt'>; Update: Partial<FamilyLinkCode> }
      FamilyMessageLog: { Row: FamilyMessageLog; Insert: Omit<FamilyMessageLog, 'id' | 'sentAt'>; Update: Partial<FamilyMessageLog> }
    }
  }
}
