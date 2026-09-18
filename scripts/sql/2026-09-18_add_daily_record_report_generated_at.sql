-- 連絡帳を生成（ダウンロード）した日時を記録する
--
-- 背景: 連絡帳生成画面で、どの利用者がすでに連絡帳を作成済みか
-- 一覧から分からず、重複生成や生成漏れの確認がしづらかったため、
-- ダウンロード完了時にこの列へ記録し、「作成済」表示に使う。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "reportGeneratedAt" timestamptz;

COMMENT ON COLUMN "DailyRecord"."reportGeneratedAt" IS '連絡帳（Excel）をダウンロードした日時。連絡帳生成画面の「作成済」表示に使う';
