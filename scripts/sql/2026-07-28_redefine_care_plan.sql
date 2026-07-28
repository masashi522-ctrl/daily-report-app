-- 介護計画書（通所介護計画書）を実際の様式（通所介護計画書 最新(原本).xls）に合わせて再定義
--
-- 背景: 前回作成したCarePlanテーブルは仮の項目だったため、
-- 実際の帳票（作成年月日/作成者、利用者氏名・生年月日・要介護、
-- 課題分析の結果、総合的な援助の方針、ゴールのイメージ、
-- 援助目標（課題ニーズ/長期目標/短期目標/サービス内容/頻度の複数行）、
-- サービス達成状況（モニタリング日・期間・評価内容）、
-- 説明日・説明者・利用者同意 等）に合わせて全面的に作り直す。
--
-- CarePlanテーブルはまだ1件もデータが入っていないことを確認済みのため、
-- DROPしてから作り直しても既存データへの影響はありません。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。

DROP TABLE IF EXISTS "CarePlan";

CREATE TABLE "CarePlan" (
  id                      text PRIMARY KEY,
  "residentId"            text NOT NULL UNIQUE REFERENCES "Resident"(id) ON DELETE CASCADE,
  "facilityId"            text,
  "planDate"              date,
  "staffName"             text,
  "birthDate"             date,
  "careLevel"             text,
  "needsAnalysis"         text,
  "supportPolicy"         text,
  "goalImage"             text,
  "goals"                 jsonb,
  "monitoringDate"        date,
  "evaluationPeriodStart" date,
  "evaluationPeriodEnd"   date,
  "evaluationContent"     text,
  "explanationDate"       date,
  "explainerName"         text,
  "familyConfirmation"    text,
  "proxySigner"           text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);
