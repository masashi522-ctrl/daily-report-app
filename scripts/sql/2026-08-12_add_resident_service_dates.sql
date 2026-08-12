-- 利用者管理に「利用開始日」「利用中止日」「入退院期間（履歴）」を追加する
--
-- serviceStartDate: 利用を開始した日
-- serviceEndDate:    利用を中止した日（入力されるとアプリ側で自動的に「退所」扱い＝isActive=falseにする）
-- hospitalizations:  入退院の履歴。JSON配列で保持する
--   例: [{"admissionDate": "2026-05-01", "dischargeDate": "2026-05-20"}, {"admissionDate": "2026-07-10", "dischargeDate": null}]
--   dischargeDate が null の場合は「まだ退院していない（入院中）」を表す
--
-- Supabase の SQL Editor でこの内容を実行してください。
-- 既存のResidentの行は影響を受けません（新しい列はすべてNULLで追加されます）。

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "serviceStartDate" date,
  ADD COLUMN IF NOT EXISTS "serviceEndDate" date,
  ADD COLUMN IF NOT EXISTS "hospitalizations" jsonb;
