-- 施設ごとのログインURL(/[slug]/login)を有効にするためのslug設定
--
-- 背景: マルチテナント機能(コミット89c7aff)導入時、既存の2施設には
-- slugが設定されないまま残っていた(slug = NULL)。/[slug]/login など
-- slugを前提とする画面を使うには、各施設にslugを設定する必要がある。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- 同じ値を再実行しても安全です。

UPDATE "Facility" SET slug = 'genkimura', "updatedAt" = now()
  WHERE id = 'genkimura-facility';

UPDATE "Facility" SET slug = 'mokumoku', "updatedAt" = now()
  WHERE id = 'd56bcda8-19d9-4900-9003-197106f7f683';
