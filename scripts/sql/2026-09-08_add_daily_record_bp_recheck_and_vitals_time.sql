-- 血圧再検の値と、バイタルを測定した時刻を記録できるようにする
--
-- 背景: 血圧が基準を外れて再検した場合、これまでは同じ欄に上書きするしかなく、
-- 最初に警告となった値が残らなかった。警告値はそのまま残し、再検した値を
-- 別の列に入力できるようにする（AM/PMそれぞれ、収縮期・拡張期の両方）。
-- あわせて、バイタルを測定した時刻（AM/PMそれぞれ1回分）も記録できるようにする。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "bpSystolicRecheck"    integer,
  ADD COLUMN IF NOT EXISTS "bpDiastolicRecheck"   integer,
  ADD COLUMN IF NOT EXISTS "bpSystolicPmRecheck"  integer,
  ADD COLUMN IF NOT EXISTS "bpDiastolicPmRecheck" integer,
  ADD COLUMN IF NOT EXISTS "vitalsTimeAm" text,
  ADD COLUMN IF NOT EXISTS "vitalsTimePm" text;

COMMENT ON COLUMN "DailyRecord"."bpSystolicRecheck"    IS '血圧再検（AM・収縮期）。警告の元の値はbpSystolicに残したまま入力する';
COMMENT ON COLUMN "DailyRecord"."bpDiastolicRecheck"   IS '血圧再検（AM・拡張期）';
COMMENT ON COLUMN "DailyRecord"."bpSystolicPmRecheck"  IS '血圧再検（PM・収縮期）';
COMMENT ON COLUMN "DailyRecord"."bpDiastolicPmRecheck" IS '血圧再検（PM・拡張期）';
COMMENT ON COLUMN "DailyRecord"."vitalsTimeAm" IS 'バイタルを測定した時刻（AM、"HH:MM"）';
COMMENT ON COLUMN "DailyRecord"."vitalsTimePm" IS 'バイタルを測定した時刻（PM、"HH:MM"）';
