-- 入浴記録「保存すると内容がはじかれる」不具合の修正用SQL
--
-- 背景: コミット b35c712 (Add bathing care items and special notes) で
-- コードは bathingCareChecks / bathingCareItems / bathingSpecialItems /
-- bathingSpecialFreeText を参照するようになったが、対応する
-- ALTER TABLE がリポジトリに保存されておらず、本番Supabaseに未適用の
-- 可能性がある。saveBathingRecord は入浴状況の保存のたびに
-- bathingCareChecks を含む payload を送るため、この列が存在しないと
-- 入浴状況の保存自体が失敗する。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "bathingCareChecks" TEXT;

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "bathingCareItems" TEXT;

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "bathingSpecialItems" TEXT;

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "bathingSpecialFreeText" TEXT;
