-- ============================================================================
-- LINEからの「連携申請」機能のための移行スクリプト
-- Supabase の SQL Editor にこのファイルを貼り付けて実行してください（何度実行しても大丈夫です）。
--
-- お店・電話・ホットペッパーで予約したお客様は、LINEとお客様情報がつながっていないため、
-- LINEの「予約確認」に予約が表示されず、前日リマインドも届かない。
-- そこで、お客様がLINEの予約確認ページから「お名前・電話番号」で連携を申請し、
-- スタッフが顧客管理画面で確認・承認したらつながる、という流れにする。
-- ============================================================================

create table if not exists line_link_requests (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,                 -- 申請したお客様のLINEユーザーID（LIFFで確認済み）
  line_display_name text,                     -- LINEの表示名（スタッフが確認するときの参考）
  name text not null,                         -- お客様が入力したお名前
  furigana text,
  phone text not null,                        -- お客様が入力した電話番号
  suggested_customer_id uuid references customers(id) on delete set null, -- 自動で見つけた候補のお客様
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  customer_id uuid references customers(id) on delete set null,           -- 承認したときにつないだお客様
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists line_link_requests_status_idx on line_link_requests (status, created_at);
create index if not exists line_link_requests_line_user_idx on line_link_requests (line_user_id);

-- ログイン中のスタッフだけが見る・承認できる（お客様からの申請の登録はサーバー側で行う）
alter table line_link_requests enable row level security;
drop policy if exists "staff_authenticated_all" on line_link_requests;
create policy "staff_authenticated_all" on line_link_requests for all to authenticated using (true) with check (true);
