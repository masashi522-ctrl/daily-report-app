-- ログイン試行の回数制限（セキュリティ点検 2026-09-12の重大03）のため、
-- Staffにログイン失敗回数とロック解除時刻を追加する。
--
-- failedLoginAttempts: 直近の連続ログイン失敗回数。ログイン成功でゼロに戻す
-- lockedUntil: この時刻までログインを拒否する（未設定＝ロックなし）
--
-- Supabase の SQL Editor でこの内容を実行してください。
-- 既存のStaffの行は影響を受けません（failedLoginAttemptsは0、lockedUntilはNULLで追加されます）。
--
-- このファイルを実行してから、対応するコード変更（src/app/actions/auth.ts）を
-- デプロイすること。順序が逆になると、存在しない列への参照でログインが失敗する。

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz;
