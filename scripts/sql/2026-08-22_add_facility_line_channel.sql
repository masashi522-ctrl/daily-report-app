-- LINE公式アカウントを施設ごとに持てるようにする
--
-- これまではアプリ全体で1つのアカウントしか使えず、複数の施設を運用すると
-- どの施設からの連絡か分からず、無料枠の通数も取り合いになっていた。
-- 施設ごとにチャネルを登録し、その施設のアカウントから送るようにする。
--
-- botUserId は公式アカウント自身のID。LINEからのWebhookには宛先として
-- destination に入ってくるため、これでどの施設宛の通知かを判別する。
-- トークンを登録するときにLINEへ問い合わせて自動的に埋める。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "Facility"
  ADD COLUMN IF NOT EXISTS "lineChannelAccessToken" text,
  ADD COLUMN IF NOT EXISTS "lineChannelSecret"      text,
  ADD COLUMN IF NOT EXISTS "lineBotUserId"          text,
  ADD COLUMN IF NOT EXISTS "lineBotDisplayName"     text,
  ADD COLUMN IF NOT EXISTS "lineLinkedAt"           timestamptz;

COMMENT ON COLUMN "Facility"."lineChannelAccessToken" IS 'チャネルアクセストークン（長期）。パスワード同様の秘密情報';
COMMENT ON COLUMN "Facility"."lineChannelSecret"      IS 'チャネルシークレット。Webhookの署名検証に使う';
COMMENT ON COLUMN "Facility"."lineBotUserId"          IS '公式アカウント自身のID。Webhookの destination と突き合わせる';
COMMENT ON COLUMN "Facility"."lineBotDisplayName"     IS '公式アカウントの表示名。設定画面での確認用';
COMMENT ON COLUMN "Facility"."lineLinkedAt"           IS 'LINEの設定を登録した日時';

-- Webhookは destination から施設を引くため、その索引を足す
CREATE UNIQUE INDEX IF NOT EXISTS facility_line_bot_user
  ON "Facility" ("lineBotUserId") WHERE "lineBotUserId" IS NOT NULL;
