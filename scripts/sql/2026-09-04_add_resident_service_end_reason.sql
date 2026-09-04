-- 月次報告の「当月の利用中止者」に理由を載せるための列を追加
--
-- 背景: 利用中止日（serviceEndDate）は保存できるが、なぜ中止になったのか
-- （入所・入院・転居・死亡・自己都合など）を残す場所が無かった。
-- 月次報告で中止者を一覧にするにあたり、理由を添えられるようにする。
--
-- なお入院理由は Resident.hospitalizations（JSON）の各期間に reason を
-- 足す形で持たせるため、この列のような追加は不要。
--
-- Supabase の SQL Editor でこのファイルの内容を実行してください。
-- IF NOT EXISTS を使っているため、複数回実行しても安全です。

ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "serviceEndReason" TEXT;
