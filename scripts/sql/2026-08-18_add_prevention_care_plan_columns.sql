-- 介護予防通所介護計画書（要支援の方の様式）に必要な列を CarePlan に追加する
--
-- 背景: 介護計画書は要介護の方向けの「通所介護計画書」様式のみに対応していたが、
-- 要支援の方には「介護予防通所介護計画書」を交付する必要がある。様式が異なり、
-- 「目標とする生活（1日／1年）」「必要な事業プログラム」「健康状態についての留意点」
-- 「利用時間」などの欄が追加されるため、対応する列を追加する。
--
-- 援助目標の表（目標／支援のポイント／サービス内容／頻度／期間）は、既存の
-- goals カラム（JSON）に項目を追加して保存するため、列の追加は不要。
--
-- これらの列が無い状態でも、要介護の方の介護計画書はこれまでどおり保存できる。
-- 要支援の方の計画書を保存しようとした場合のみ、保存に失敗する。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "CarePlan"
  ADD COLUMN IF NOT EXISTS "gender"           text,
  ADD COLUMN IF NOT EXISTS "version"          integer,
  ADD COLUMN IF NOT EXISTS "dailyGoal"        text,
  ADD COLUMN IF NOT EXISTS "yearlyGoal"       text,
  ADD COLUMN IF NOT EXISTS "healthNotes"      text,
  ADD COLUMN IF NOT EXISTS "programs"         text,
  ADD COLUMN IF NOT EXISTS "serviceStartTime" text,
  ADD COLUMN IF NOT EXISTS "serviceEndTime"   text;

COMMENT ON COLUMN "CarePlan"."gender"           IS '性別（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."version"          IS '第◯版（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."dailyGoal"        IS '目標とする生活・1日（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."yearlyGoal"       IS '目標とする生活・1年（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."healthNotes"      IS '健康状態についての留意点（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."programs"         IS '必要な事業プログラム。選択項目をカンマ区切りで保存';
COMMENT ON COLUMN "CarePlan"."serviceStartTime" IS '利用時間（開始）（介護予防通所介護計画書のみ）';
COMMENT ON COLUMN "CarePlan"."serviceEndTime"   IS '利用時間（終了）（介護予防通所介護計画書のみ）';
