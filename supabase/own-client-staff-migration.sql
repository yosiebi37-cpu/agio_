-- 業務委託スタッフの「本人顧客（持ち込み客）」を記録する列を追加
-- この列に業務委託スタッフが設定されたお客様を、そのスタッフが担当したときだけ
-- 「本人顧客」報酬率（commission_settings.existing_rate / 既定60%）で計算する。
-- それ以外（agioの新規・再来・フリー・再来指名）はすべて「店舗客」報酬率（new_rate / 既定50%）。
alter table customers
  add column if not exists own_client_staff_id uuid references staff(id) on delete set null;

create index if not exists customers_own_client_staff_idx on customers (own_client_staff_id);

-- PostgREST（Supabase API）に新しい列を認識させる
notify pgrst, 'reload schema';
