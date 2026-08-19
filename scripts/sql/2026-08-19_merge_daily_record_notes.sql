-- 日次記録の「備考」を「特記事項」に統合する
--
-- 背景: 日次記録には自由記載欄が「備考」(oralCareNote) と「特記事項」(specialNotes)
-- の2つあり、書き分けの基準が曖昧だった。画面から備考欄を廃止し、特記事項に
-- 一本化したため、これまでの備考の内容を特記事項へ移す。
--
-- 両方に記載がある場合は「特記事項 / 備考」の形でつなげる。
-- 移し終えた備考は空にするため、このSQLは複数回実行しても内容が重複しない。
--
-- アプリのデプロイ後（備考欄が画面から消えた後）に実行してください。
-- Supabase の SQL Editor でこのファイルの内容を実行してください。

UPDATE "DailyRecord"
SET "specialNotes" = CASE
      WHEN COALESCE(TRIM("specialNotes"), '') = '' THEN TRIM("oralCareNote")
      ELSE TRIM("specialNotes") || ' / ' || TRIM("oralCareNote")
    END,
    "oralCareNote" = NULL,
    "updatedAt" = now()
WHERE COALESCE(TRIM("oralCareNote"), '') <> '';
