-- 利用曜日の変更に「適用開始日」を持たせる
--
-- 背景: 利用者管理の「利用曜日」は常に「今の設定」1つしか保持しておらず、
-- 変更すると即座に過去・未来すべての日付に一律適用されていた。
-- 月の途中で利用曜日を追加登録し、実際の開始は来週から、といった
-- 事前登録ができるよう、変更前の曜日と適用開始日を別途持たせる。
--
-- attendanceDays               … 最新（いずれ有効になる）の利用曜日
-- attendanceDaysPrevious       … attendanceDaysEffectiveFrom より前の日付に使う、変更前の利用曜日
-- attendanceDaysEffectiveFrom  … attendanceDays が有効になる日（この日以降に適用。未設定なら即時反映）
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "attendanceDaysPrevious" text,
  ADD COLUMN IF NOT EXISTS "attendanceDaysEffectiveFrom" date;

COMMENT ON COLUMN "Resident"."attendanceDaysPrevious" IS 'attendanceDaysEffectiveFrom より前の日付に使う、変更前の利用曜日。未来日の適用開始を予約していないときは未設定';
COMMENT ON COLUMN "Resident"."attendanceDaysEffectiveFrom" IS 'attendanceDays が有効になる日。未設定なら attendanceDays は即時（登録時から）有効';
