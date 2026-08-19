-- 利用者管理のゴール設定を、メインとサブに分けて保存できるようにする
--
-- 背景: ゴール設定は「メインとなるゴールのイメージ」と「サブのゴールのイメージ」を
-- それぞれ設定する運用のため、既存の goalImage（メイン）に加えて
-- サブを保存する列が必要になった。サブは複数登録できるよう、1行に1つの形で保存する。
--
-- 先に 2026-08-19_add_resident_goal_image.sql を実行しておいてください。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "subGoalImage" text;

COMMENT ON COLUMN "Resident"."goalImage"    IS 'ACPの取り組みで設定するメインのゴールのイメージ';
COMMENT ON COLUMN "Resident"."subGoalImage" IS 'サブのゴールのイメージ。1行に1つ';
