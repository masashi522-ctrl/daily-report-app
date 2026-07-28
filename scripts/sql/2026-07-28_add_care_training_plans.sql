-- 機能訓練計画書・介護計画書（通所介護計画書）の保存用テーブルを追加
--
-- 背景: 利用者ごとに1件、常に最新の計画内容を保持するテーブル。
-- 改定するたびに同じ行を上書き保存する運用（履歴は持たない）。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- 同じ内容を再実行しても安全です（IF NOT EXISTS）。

CREATE TABLE IF NOT EXISTS "TrainingPlan" (
  id               text PRIMARY KEY,
  "residentId"     text NOT NULL UNIQUE REFERENCES "Resident"(id) ON DELETE CASCADE,
  "facilityId"     text,
  "planDate"       date,
  "nextReviewDate" date,
  "staffName"      text,
  "physicalStatus" text,
  "userIntention"  text,
  "familyIntention" text,
  "issues"         text,
  "longTermGoal"   text,
  "shortTermGoal"  text,
  "trainingContent" text,
  "frequency"      text,
  "notes"          text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CarePlan" (
  id               text PRIMARY KEY,
  "residentId"     text NOT NULL UNIQUE REFERENCES "Resident"(id) ON DELETE CASCADE,
  "facilityId"     text,
  "planDate"       date,
  "nextReviewDate" date,
  "staffName"      text,
  "careLevel"      text,
  "lifeIssues"     text,
  "longTermGoal"   text,
  "shortTermGoal"  text,
  "serviceContent" text,
  "considerations" text,
  "familyConfirmation" text,
  "notes"          text,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);
