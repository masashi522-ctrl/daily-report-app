// 計画書に記名する職員は、施設ごとに決まった人だけ。
// 一覧を持たない施設はこれまで通り自由入力にする（他施設の職員名しか選べない状態にしないため）。
export type PlanStaffField =
  | 'carePlanAuthor'
  | 'carePlanExplainer'
  | 'trainingPlanAuthor'
  | 'trainingPlanExplainer'

const STAFF_BY_FACILITY: Record<string, Record<PlanStaffField, readonly string[]>> = {
  genkimura: {
    carePlanAuthor: ['佐々木優', '曽谷圭助'],
    carePlanExplainer: ['佐々木優', '曽谷圭助'],
    trainingPlanAuthor: ['山根正成', '奥田知佳'],
    trainingPlanExplainer: ['佐々木優', '曽谷圭助', '奥田知佳'],
  },
}

export function planStaffOptions(facilitySlug: string, field: PlanStaffField): readonly string[] {
  return STAFF_BY_FACILITY[facilitySlug]?.[field] ?? []
}
