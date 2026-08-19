-- 日次記録に排便（量・質）を追加する
--
-- 量: 少量 / 片手 / 両手 / 多量
-- 質: コロ便 / 硬便 / 普通 / 軟便 / 水様便
--
-- 排便が無い日もあるため、記入漏れのチェック対象には含めない。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "bowelAmount"  text,
  ADD COLUMN IF NOT EXISTS "bowelQuality" text;

COMMENT ON COLUMN "DailyRecord"."bowelAmount"  IS '排便の量（少量・片手・両手・多量）';
COMMENT ON COLUMN "DailyRecord"."bowelQuality" IS '排便の質（コロ便・硬便・普通・軟便・水様便）';
