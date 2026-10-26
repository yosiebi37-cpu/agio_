-- 顧客の「来店経路（何がきっかけで初めて来店したか）」を記録する列を追加
-- 例: ホットペッパー / Instagram / Googleマップ / 紹介 / 通りがかり / 以前からのお客様 / その他
alter table customers add column if not exists acquisition_source text;

-- PostgREST（Supabase API）に新しい列を認識させる
notify pgrst, 'reload schema';
