-- スタッフ本人のログインアカウントと staff テーブルを紐付ける
-- 既存プロジェクトに1度だけ適用するマイグレーション

alter table staff
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists staff_user_id_idx on staff (user_id) where user_id is not null;
