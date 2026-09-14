-- 「誰が・いつ・どの記録を書き換えたか」を残すための監査ログ
-- （セキュリティ点検2026-09-12の低13）。
--
-- 日次記録（DailyRecord）・利用者（Resident）・職員アカウント（Staff）の
-- 作成・更新・削除だけを対象にした、軽量な操作ログ。値そのものの
-- 前後比較（スナップショット）までは持たない —— ケアプランには既に
-- CarePlanHistoryがあるため、ここでは扱わない。
--
-- Supabase の SQL Editor でこの内容を実行してください。

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" text PRIMARY KEY,
  "facilityId" text NOT NULL,
  "staffId" text,
  "staffName" text NOT NULL,
  "action" text NOT NULL,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  "summary" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AuditLog_facilityId_createdAt_idx" ON "AuditLog" ("facilityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog" ("targetType", "targetId");

-- 2026-09-14_enable_rls.sql と同じ方針（service_roleのみ使用のため、
-- ポリシーは追加せずRLSだけ有効化する）
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
