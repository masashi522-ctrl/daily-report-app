-- 集計・分析画面の月次報告書に添付する写真（利用者ごと・月ごとに最大5枚）を管理するテーブル
--
-- facilityId / residentId / year / month の組み合わせで対象月の写真を絞り込む。
-- 実際の画像ファイルは Supabase Storage の非公開バケット "resident-monthly-photos" に保存し、
-- storagePath にはバケット内のパス（例: {facilityId}/{residentId}/{year}-{month}/{photoId}.jpg）を保持する。
-- 5枚までという上限はアプリ側（サーバーアクション）で担保する。
--
-- Supabase の SQL Editor でこの内容を実行してください。

CREATE TABLE IF NOT EXISTS "ResidentMonthlyPhoto" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId"  text NOT NULL,
  "residentId"  text NOT NULL,
  year          integer NOT NULL,
  month         integer NOT NULL,
  "storagePath" text NOT NULL,
  caption       text,
  "sortOrder"   integer NOT NULL DEFAULT 0,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resident_monthly_photo_lookup
  ON "ResidentMonthlyPhoto" ("residentId", year, month);
