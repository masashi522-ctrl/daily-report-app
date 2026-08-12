import type { HospitalizationPeriod } from '@/types/database'

// dateがhospitalizations（入退院期間の履歴）のいずれかの期間内に含まれるかを判定する。
// dischargeDateがnull（未退院）の場合は、admissionDate以降すべて入院中とみなす。
export function isHospitalizedOn(
  hospitalizations: HospitalizationPeriod[] | null | undefined,
  date: string,
): boolean {
  if (!hospitalizations || hospitalizations.length === 0) return false
  return hospitalizations.some(h => {
    if (!h.admissionDate || h.admissionDate > date) return false
    if (h.dischargeDate && h.dischargeDate < date) return false
    return true
  })
}
