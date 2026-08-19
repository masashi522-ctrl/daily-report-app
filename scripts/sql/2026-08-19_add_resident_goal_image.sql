-- 利用者管理に「性別」と「ゴール設定（ゴールのイメージ）」を追加する
--
-- 背景: ACPの取り組みとして、利用者ごとにゴールのイメージを登録できるようにする。
-- 入力したゴールのイメージをもとに、AIがメイン・サブのゴールのイメージを提案する
-- 機能を利用者管理画面に追加したため、その保存先が必要になった。
-- 性別は、AIへの依頼文（「○○の男性利用者です」）に使うために追加する。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "gender"    text,
  ADD COLUMN IF NOT EXISTS "goalImage" text;

COMMENT ON COLUMN "Resident"."gender"    IS '性別（男／女）。ゴールのイメージのAI提案に使用';
COMMENT ON COLUMN "Resident"."goalImage" IS 'ACPの取り組みで設定するゴールのイメージ';
