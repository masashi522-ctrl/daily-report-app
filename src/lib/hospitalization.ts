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

// dateの時点で退院日が未入力のまま続いている入院期間の位置を返す。なければ-1。
// 該当が複数あるときは入院日が最新のものを対象にする。
export function findOpenHospitalizationIndex(
  hospitalizations: HospitalizationPeriod[] | null | undefined,
  date: string,
): number {
  if (!hospitalizations) return -1
  let found = -1
  hospitalizations.forEach((h, i) => {
    if (h.dischargeDate) return
    if (!h.admissionDate || h.admissionDate > date) return
    if (found === -1 || h.admissionDate > hospitalizations[found].admissionDate) found = i
  })
  return found
}
