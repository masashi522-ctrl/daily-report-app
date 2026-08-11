-- 機能訓練計画書を実際の様式（個別機能訓練計画書、げんきむらデイサービスセンターの帳票）に合わせて再定義
--
-- 背景: これまでのTrainingPlanは仮の項目だったため、実際の帳票
-- （前回作成日/初回作成日/版数、性別、要介護度、障害高齢者・認知症高齢者の
-- 日常生活自立度、課題分析の結果、総合的な援助の方針、ゴールのイメージ、
-- 社会参加の状況、家屋の状況、リハビリ目標（課題ニーズ/長期目標/短期目標/
-- サービス内容/頻度の複数行）、健康状態・経過（病名/発症日/入退院日）、
-- 機能訓練実施上の留意事項、リハビリ達成状況（モニタリング日/期間/内容）、
-- 説明日・説明者・利用者同意署名・代筆者署名 等）に合わせて全面的に作り直す。
--
-- 既に3件のデータが保存されているため、CarePlanのときのようなDROPはせず、
-- 新しい列を追加したうえで、意味が対応する旧項目のデータを新項目へ移行する。
-- 旧項目の列は万一の参照に備えてそのまま残す（アプリからは未使用・非表示になるだけで削除はしない）。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- 同じ内容を再実行しても安全なように IF NOT EXISTS を使っています。
-- データ移行のUPDATEは、新項目に既に値が入っている行には影響しません。

ALTER TABLE "TrainingPlan"
  ADD COLUMN IF NOT EXISTS "previousPlanDate" date,
  ADD COLUMN IF NOT EXISTS "firstPlanDate" date,
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "gender" text,
  ADD COLUMN IF NOT EXISTS "birthDate" date,
  ADD COLUMN IF NOT EXISTS "careLevel" text,
  ADD COLUMN IF NOT EXISTS "adlIndependenceLevel" text,
  ADD COLUMN IF NOT EXISTS "dementiaIndependenceLevel" text,
  ADD COLUMN IF NOT EXISTS "needsAnalysis" text,
  ADD COLUMN IF NOT EXISTS "supportPolicy" text,
  ADD COLUMN IF NOT EXISTS "goalImage" text,
  ADD COLUMN IF NOT EXISTS "socialParticipation" text,
  ADD COLUMN IF NOT EXISTS "housingSituation" text,
  ADD COLUMN IF NOT EXISTS "goals" jsonb,
  ADD COLUMN IF NOT EXISTS "diseaseName" text,
  ADD COLUMN IF NOT EXISTS "onsetDate" date,
  ADD COLUMN IF NOT EXISTS "recentAdmissionDate" date,
  ADD COLUMN IF NOT EXISTS "recentDischargeDate" date,
  ADD COLUMN IF NOT EXISTS "trainingPrecautions" text,
  ADD COLUMN IF NOT EXISTS "monitoringDate" date,
  ADD COLUMN IF NOT EXISTS "monitoringPeriod" text,
  ADD COLUMN IF NOT EXISTS "monitoringContent" text,
  ADD COLUMN IF NOT EXISTS "explanationDate" date,
  ADD COLUMN IF NOT EXISTS "explainerName" text,
  ADD COLUMN IF NOT EXISTS "familySignature" text,
  ADD COLUMN IF NOT EXISTS "proxySignature" text;

-- 旧項目 → 新項目へのデータ移行（新項目が未設定の行のみ）

-- 本人の意向・家族の意向 → 【利用者及び家族の生活に対する意向を踏まえた課題分析の結果】
UPDATE "TrainingPlan"
SET "needsAnalysis" = trim(both E'\n' FROM
  CASE WHEN COALESCE("userIntention", '') <> '' THEN '【本人の意向】' || E'\n' || "userIntention" || E'\n\n' ELSE '' END ||
  CASE WHEN COALESCE("familyIntention", '') <> '' THEN '【家族の意向】' || E'\n' || "familyIntention" ELSE '' END
)
WHERE "needsAnalysis" IS NULL
  AND (COALESCE("userIntention", '') <> '' OR COALESCE("familyIntention", '') <> '');

-- 心身の状況・留意事項 → 【機能訓練実施上の留意事項（運動強度・負荷量等）】
UPDATE "TrainingPlan"
SET "trainingPrecautions" = trim(both E'\n' FROM
  CASE WHEN COALESCE("physicalStatus", '') <> '' THEN '【心身の状況】' || E'\n' || "physicalStatus" || E'\n\n' ELSE '' END ||
  CASE WHEN COALESCE("notes", '') <> '' THEN '【留意事項・特記事項】' || E'\n' || "notes" ELSE '' END
)
WHERE "trainingPrecautions" IS NULL
  AND (COALESCE("physicalStatus", '') <> '' OR COALESCE("notes", '') <> '');

-- 課題・長期目標・短期目標・訓練内容・頻度 → 【リハビリ目標】（1行分の配列として引き継ぐ）
UPDATE "TrainingPlan"
SET "goals" = jsonb_build_array(
  jsonb_build_object(
    'issue', COALESCE("issues", ''),
    'longTermGoal', COALESCE("longTermGoal", ''),
    'shortTermGoal', COALESCE("shortTermGoal", ''),
    'serviceContent', COALESCE("trainingContent", ''),
    'frequency', COALESCE("frequency", '')
  )
)
WHERE "goals" IS NULL
  AND (COALESCE("issues", '') <> '' OR COALESCE("longTermGoal", '') <> '' OR COALESCE("shortTermGoal", '') <> ''
       OR COALESCE("trainingContent", '') <> '' OR COALESCE("frequency", '') <> '');

-- 次回評価予定日 → モニタリング日（参考値として引き継ぎ。実施日に応じて後で修正してください）
UPDATE "TrainingPlan"
SET "monitoringDate" = "nextReviewDate"
WHERE "monitoringDate" IS NULL AND "nextReviewDate" IS NOT NULL;
