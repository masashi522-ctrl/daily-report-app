-- 家族連絡の画面で、送信済みの内容をあとから見られるようにする
--
-- これまでの送信履歴は「いつ・誰に・成功したか」だけを記録していたため、
-- 何を送ったのかを後から確認できなかった。
-- 送信した画像の保存先（Supabase Storage のパス）を残しておき、
-- 閲覧時に署名付きURLを作り直して表示する。
--
-- imagePaths には次の形で入れる:
--   {"report": "line/<施設>/<利用者>/<日付>-<ID>.png",
--    "photos": ["<写真のパス>", ...]}
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "FamilyMessageLog"
  ADD COLUMN IF NOT EXISTS "imagePaths" jsonb;

COMMENT ON COLUMN "FamilyMessageLog"."imagePaths"
  IS '送信した画像の保存先。{"report": "...", "photos": ["..."]}';

-- 家族連絡の画面は「施設 × 日付の範囲」で読むため、その並びの索引を足す
CREATE INDEX IF NOT EXISTS family_message_log_facility_date
  ON "FamilyMessageLog" ("facilityId", date);
