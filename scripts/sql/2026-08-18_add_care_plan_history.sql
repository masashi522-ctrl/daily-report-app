-- 計画書（通所介護計画書／介護予防通所介護計画書）の版の控えを保存するテーブルを追加
--
-- 背景: CarePlan は利用者1人につき1行（residentId が UNIQUE）で、保存のたびに
-- 上書きされるため、過去に交付した計画書の内容が残らなかった。
-- 計画を作り直すたびに「第◯版として保存」で控えを残し、あとから内容の確認と
-- Excel出力ができるようにする。
--
-- snapshot には保存時点の CarePlan の内容をそのまま JSON で保存する。
-- 様式が変わっても過去の版をそのまま出力できるよう、planType（standard =
-- 通所介護計画書 / prevention = 介護予防通所介護計画書）も併せて記録する。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

CREATE TABLE IF NOT EXISTS "CarePlanHistory" (
  id           text PRIMARY KEY,
  "residentId" text NOT NULL REFERENCES "Resident"(id) ON DELETE CASCADE,
  "facilityId" text,
  version      integer NOT NULL,
  "planType"   text NOT NULL DEFAULT 'standard',
  "planDate"   date,
  snapshot     jsonb NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CarePlanHistory_resident_version_idx"
  ON "CarePlanHistory" ("residentId", version DESC);

COMMENT ON TABLE  "CarePlanHistory"            IS '計画書を新しい版として保存したときの控え';
COMMENT ON COLUMN "CarePlanHistory"."planType" IS 'standard = 通所介護計画書 / prevention = 介護予防通所介護計画書';
COMMENT ON COLUMN "CarePlanHistory".snapshot   IS '保存時点の CarePlan の内容';
