-- 月次報告（稼働率等の集計表）のため、施設の定員情報を追加する
--
-- capacity: 施設全体の1日あたり定員
-- capacityByCategory: 時間区分（3-4/4-5/5-6/6-7/7-8/8-9）ごとの定員をJSONで保持
--   例: {"3-4": 5, "4-5": 10, "5-6": 5, "6-7": 5, "7-8": 5, "8-9": 5}
--
-- どちらも未設定（null）の場合、月次報告画面では稼働率を「未設定」として表示する。
--
-- Supabase の SQL Editor でこの内容を実行してください。
-- 既存のFacilityの行は影響を受けません（新しい列はすべてNULLで追加されます）。

ALTER TABLE "Facility"
  ADD COLUMN IF NOT EXISTS "capacity" integer,
  ADD COLUMN IF NOT EXISTS "capacityByCategory" jsonb;
