// 月次報告書の型は src/lib/care-report.ts に移したが、画面側は従来どおり
// './actions' から参照しているため、ここで再輸出している。
// 生成処理は ./report-actions.ts（保存まで行うサーバーアクション）に移した。

export type { CareNote, CarePlanGoalSummary, CarePlanSummary, ServiceGap, DailyNote, ReportStats } from '@/lib/care-report'
