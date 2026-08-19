-- 日次記録に「その日の様子」欄を追加する
--
-- 背景: これまで自由記載は「備考」と「特記事項（体重・SpO2等）」しかなく、
-- その日の活動の様子やご本人の言葉を残す場所がなかった。
-- 連絡帳の「日中のご様子・連絡事項」をAIが作成する際も材料が乏しく、
-- 記録に無い内容が混ざる原因になっていたため、専用の記入欄を設ける。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "DailyRecord"
  ADD COLUMN IF NOT EXISTS "dailyNote" text;

COMMENT ON COLUMN "DailyRecord"."dailyNote" IS 'その日の様子（活動の様子・ご本人の言葉など）。連絡帳のAI文章の材料にも使う';
