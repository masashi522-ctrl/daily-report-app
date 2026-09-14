-- Supabaseの行レベルセキュリティ（RLS）を有効化する（セキュリティ点検2026-09-12の低14）。
--
-- このアプリはサーバー側で必ずSUPABASE_SERVICE_KEY（service_role）を使っており、
-- service_roleはRLSを無条件にバイパスするため、ポリシーを1つも作らずRLSだけ
-- 有効化しても、アプリの動作には影響しない。
-- 目的は「anonキーが万一漏れても、それだけではデータを読み書きできない」
-- という最後の防波堤を用意すること（現状NEXT_PUBLIC_SUPABASE_ANON_KEYは
-- src/ のどこからもDB直アクセスには使われていないことを確認済み）。
--
-- Supabase の SQL Editor でこの内容を実行してください。
-- 実行前後でアプリの挙動に違いはないはず。念のため、実行後に主要な画面
-- （ログイン・利用者一覧・日次記録の保存）が問題なく動くことを確認すること。

ALTER TABLE "Facility"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resident"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyRecord"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarePlan"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarePlanHistory"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CareReport"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingPlan"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResidentMonthlyPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyContact"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyLinkCode"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyMessageLog"    ENABLE ROW LEVEL SECURITY;
