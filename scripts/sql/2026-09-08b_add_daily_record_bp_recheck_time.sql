-- 血圧を再検した時刻を記録できるようにする
--
-- 背景: 血圧再検の値（bpSystolicRecheck等）は入力できるようにしたが、
-- 何時に再検したかが残らなかった。いつ再検したかも記録できるようにする。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "bpRecheckTimeAm" text,
  ADD COLUMN IF NOT EXISTS "bpRecheckTimePm" text;

COMMENT ON COLUMN "DailyRecord"."bpRecheckTimeAm" IS '血圧再検（AM）を行った時刻（"HH:MM"）';
COMMENT ON COLUMN "DailyRecord"."bpRecheckTimePm" IS '血圧再検（PM）を行った時刻（"HH:MM"）';
