-- ご家族へのLINE連絡機能
--
-- 利用者ごとに「連絡の有効化」「連絡帳の共有」「活動写真の共有」を持たせ、
-- 3つすべてにチェックがあるものだけを送信対象とする（有効化 AND 各共有）。
--
-- 送信先のご家族は "FamilyContact" に登録する。氏名・続柄・LINE ID・電話番号を
-- 登録するが、LINE Messaging API のプッシュ送信に使えるのは検索用の LINE ID
-- （@から始まる表示上のID）ではなく、公式アカウントを友だち追加したときに
-- 発行される内部のユーザーID（U から始まる33文字）だけである。
-- そのため lineId は台帳としての控え、lineUserId が実際の送信先になる。
-- lineUserId は友だち追加時のWebhookで自動的に埋まる。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

-- ── 利用者側の共有設定 ──────────────────────────────────────────
ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "familyContactEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shareDailyReport"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shareActivityPhoto"   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "Resident"."familyContactEnabled" IS 'ご家族へのLINE連絡を有効にするか。これがオフなら何も送信しない';
COMMENT ON COLUMN "Resident"."shareDailyReport"     IS '連絡帳を共有するか。有効化と両方オンのときだけ送信する';
COMMENT ON COLUMN "Resident"."shareActivityPhoto"   IS '活動写真を共有するか。有効化と両方オンのときだけ送信する';

-- ── 送信先のご家族 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FamilyContact" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId"  text NOT NULL,
  "residentId"  text NOT NULL,
  name          text NOT NULL,
  relationship  text,
  "lineId"      text,
  "lineUserId"  text,
  phone         text,
  "isActive"    boolean NOT NULL DEFAULT true,
  "linkedAt"    timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN "FamilyContact"."lineId"     IS '検索用のLINE ID。台帳としての控えで、送信には使えない';
COMMENT ON COLUMN "FamilyContact"."lineUserId" IS '友だち追加時に発行される内部ユーザーID（U+32桁）。実際の送信先';
COMMENT ON COLUMN "FamilyContact"."linkedAt"   IS 'lineUserId が紐づいた日時。未連携なら NULL';

CREATE INDEX IF NOT EXISTS family_contact_resident
  ON "FamilyContact" ("residentId");

CREATE INDEX IF NOT EXISTS family_contact_facility
  ON "FamilyContact" ("facilityId");

-- 同じLINEアカウントが二重に紐づかないようにする
CREATE UNIQUE INDEX IF NOT EXISTS family_contact_line_user
  ON "FamilyContact" ("lineUserId") WHERE "lineUserId" IS NOT NULL;

-- ── 友だち追加を利用者に紐づけるための連携コード ────────────────
-- ご家族が公式アカウントを友だち追加しただけでは、どの利用者のご家族か
-- 判別できない。登録時に発行した連携コードをトークに送ってもらうことで
-- FamilyContact と lineUserId を結びつける。
CREATE TABLE IF NOT EXISTS "FamilyLinkCode" (
  code              text PRIMARY KEY,
  "familyContactId" text NOT NULL,
  "facilityId"      text NOT NULL,
  "expiresAt"       timestamptz NOT NULL,
  "usedAt"          timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_link_code_contact
  ON "FamilyLinkCode" ("familyContactId");

-- ── 送信履歴 ────────────────────────────────────────────────────
-- 同じ日の連絡帳を二重送信しないための記録も兼ねる。
CREATE TABLE IF NOT EXISTS "FamilyMessageLog" (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "facilityId"      text NOT NULL,
  "residentId"      text NOT NULL,
  "familyContactId" text NOT NULL,
  date              date NOT NULL,
  kind              text NOT NULL,
  status            text NOT NULL,
  error             text,
  "sentAt"          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN "FamilyMessageLog".kind   IS 'REPORT（連絡帳）または PHOTO（活動写真）';
COMMENT ON COLUMN "FamilyMessageLog".status IS 'SENT または FAILED';

CREATE INDEX IF NOT EXISTS family_message_log_lookup
  ON "FamilyMessageLog" ("residentId", date);
