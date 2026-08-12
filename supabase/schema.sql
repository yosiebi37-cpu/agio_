-- ============================================================================
--  agio — 美容室ダッシュボード  /  Supabase スキーマ定義
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  実行後に seed.sql を実行するとサンプルデータが投入されます。
--
--  このスキーマは Supabase Auth によるログインを前提としています。
--  スタッフのログインアカウントは Authentication → Users から作成してください。
--  既存プロジェクト（すでにこのスキーマを実行済み）を認証ありに移行する場合は、
--  代わりに auth-migration.sql を実行してください。
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- スタッフ / スタイリスト
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  initials        text not null default '',                 -- アバター用 (例: TK)
  color           text not null default '#2C4A3E',          -- 予約ブロックの色
  bg_color        text not null default '#E8F0ED',          -- アバター背景色
  fg_color        text not null default '#2C4A3E',          -- アバター文字色
  employment_type text not null default 'staff'
                    check (employment_type in ('staff', 'contract')), -- 社員 / 業務委託
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 顧客
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  furigana          text,                                   -- フリガナ (例: ヤマダ ハナコ)
  initials          text not null default '',               -- アバター用 (例: 山花)
  phone             text,
  birth_year        int,
  customer_type     text not null default 'new'
                      check (customer_type in ('existing', 'new')),   -- 既存客 / 新規客
  hair_type         text,                                   -- 髪質メモ
  allergy_tag       text,                                   -- アレルギータグ (例: ジアミンアレルギー歴)
  allergy_note      text,                                   -- アレルギー補足
  avatar_bg         text not null default '#E8F0ED',
  avatar_fg         text not null default '#2C4A3E',
  assigned_staff_id uuid references staff(id) on delete set null,
  visit_count       int not null default 0,                 -- 来店回数 (集計キャッシュ)
  lifetime_value    int not null default 0,                 -- 累計売上 円 (集計キャッシュ)
  avg_cycle_days    int,                                    -- 平均来店周期 日 (集計キャッシュ)
  last_visit_on     date,
  next_suggestion   text,                                   -- 次回提案メモ
  next_target       text,                                   -- 次回目安時期
  next_price        text,                                   -- 想定金額
  next_duration     text,                                   -- 想定所要時間
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 予約
--   タイムゾーンのズレを避けるため、日付と時刻（壁掛け時計の時刻）を分けて保持します。
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id) on delete set null,
  customer_name text not null,                              -- 表示用 (新規/フリー客にも対応)
  staff_id      uuid not null references staff(id) on delete cascade,
  booking_date  date not null,
  start_time    time not null,
  end_time      time not null,
  menu          text not null,
  status        text not null default 'confirmed'
                  check (status in ('visited', 'confirmed', 'tentative')), -- 来店済 / 確定 / 仮予約
  customer_type text not null default 'existing'
                  check (customer_type in ('existing', 'new')),
  amount        int not null default 0,                     -- 円
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists bookings_date_idx on bookings (booking_date);
create index if not exists bookings_staff_idx on bookings (staff_id);

-- ---------------------------------------------------------------------------
-- 施術履歴（カルテ）
-- ---------------------------------------------------------------------------
create table if not exists treatment_records (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  staff_id     uuid references staff(id) on delete set null,
  performed_on date not null,
  menu         text not null,
  amount       int not null default 0,
  tags         text[] not null default '{}',
  note         text,
  icon         text not null default 'scissors',            -- tabler アイコン名
  dot_bg       text not null default '#2C4A3E',
  dot_fg       text not null default '#ffffff',
  created_at   timestamptz not null default now()
);
create index if not exists treatment_customer_idx on treatment_records (customer_id, performed_on desc);

-- ---------------------------------------------------------------------------
-- 薬剤・カラー記録
-- ---------------------------------------------------------------------------
create table if not exists chemical_records (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  record_on       date not null,
  type_label      text not null,                            -- 例: ハイライトカラー
  dot_color       text not null default '#C9A84C',
  brand           text,                                     -- ブランド
  color_code      text,                                     -- 色番
  oxy             text,                                     -- オキシ濃度
  processing_time text,                                     -- 放置時間
  finish_note     text,                                     -- 仕上がり
  patch_test      boolean,                                  -- パッチテスト実施
  created_at      timestamptz not null default now()
);
create index if not exists chemical_customer_idx on chemical_records (customer_id, record_on desc);

-- ---------------------------------------------------------------------------
-- ビフォーアフター写真（実体は Supabase Storage の `karte-photos` バケットに保存）
-- ---------------------------------------------------------------------------
create table if not exists karte_photos (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete cascade,
  treatment_record_id uuid references treatment_records(id) on delete set null,
  taken_on            date,
  kind                text check (kind in ('before', 'after')),
  storage_path        text not null,                        -- バケット内のパス
  created_at          timestamptz not null default now()
);
create index if not exists photos_customer_idx on karte_photos (customer_id);

-- ---------------------------------------------------------------------------
-- 施術メニュー一覧（予約・カルテ登録時に選べるメニューと基本料金）
-- ---------------------------------------------------------------------------
create table if not exists menu_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      int not null default 0,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 業務委託の報酬率（単一行設定）
-- ---------------------------------------------------------------------------
create table if not exists commission_settings (
  id            int primary key default 1,
  existing_rate int not null default 60,                    -- 既存客 報酬率 %
  new_rate      int not null default 50,                    -- 新規客 報酬率 %
  retail_rate   int not null default 20,                    -- 店販 報酬率 %
  updated_at    timestamptz not null default now(),
  constraint commission_single_row check (id = 1)
);

-- ---------------------------------------------------------------------------
-- 業務委託スタッフの日次売上（予約ボードを使わない場合の手入力）
-- ---------------------------------------------------------------------------
create table if not exists freelance_daily_sales (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  sale_date      date not null,
  existing_amount int not null default 0,
  new_amount      int not null default 0,
  created_at     timestamptz not null default now(),
  unique (staff_id, sale_date)
);

-- ---------------------------------------------------------------------------
-- 店販売上（シャンプー・スタイリング剤などの店頭販売）
-- ---------------------------------------------------------------------------
create table if not exists retail_sales (
  id           uuid primary key default gen_random_uuid(),
  sale_date    date not null,
  staff_id     uuid references staff(id) on delete set null,
  product_name text not null,
  amount       int not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- シフト（スタッフの出勤予定）
-- ---------------------------------------------------------------------------
create table if not exists shifts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  unique (staff_id, shift_date)
);

-- ---------------------------------------------------------------------------
-- 定休日（毎週の曜日 + 特定の休業日）
-- ---------------------------------------------------------------------------
create table if not exists salon_settings (
  id              int primary key default 1,
  closed_weekdays int[] not null default '{}',              -- 0=日 ... 6=土
  updated_at      timestamptz not null default now(),
  constraint salon_settings_single_row check (id = 1)
);

insert into salon_settings (id) values (1) on conflict (id) do nothing;

insert into menu_items (name, price, sort_order)
select * from (values
  ('カット', 5500, 1),
  ('カット + カラー', 12100, 2),
  ('ハイライトカラー', 16500, 3),
  ('グレイカラー', 8800, 4),
  ('フルカラー', 8800, 5),
  ('デジタルパーマ', 17600, 6),
  ('縮毛矯正', 22000, 7),
  ('トリートメント', 4400, 8)
) as v(name, price, sort_order)
where not exists (select 1 from menu_items);

create table if not exists holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  note         text,
  created_at   timestamptz not null default now()
);

-- ============================================================================
--  Row Level Security
--  ログイン済み（authenticated）スタッフのみ読み書き可能。未ログイン（anon）は不可。
--  スタッフのログインアカウントは Supabase ダッシュボード → Authentication → Users
--  から作成してください（サインアップ画面はありません）。
-- ============================================================================
alter table staff               enable row level security;
alter table customers           enable row level security;
alter table bookings            enable row level security;
alter table treatment_records   enable row level security;
alter table chemical_records    enable row level security;
alter table karte_photos        enable row level security;
alter table commission_settings enable row level security;
alter table shifts              enable row level security;
alter table salon_settings      enable row level security;
alter table holidays            enable row level security;
alter table retail_sales        enable row level security;
alter table freelance_daily_sales enable row level security;
alter table menu_items          enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','customers','bookings','treatment_records',
    'chemical_records','karte_photos','commission_settings','shifts',
    'salon_settings','holidays','retail_sales','freelance_daily_sales','menu_items'
  ]
  loop
    execute format(
      'drop policy if exists "staff_authenticated_all" on %I;', t);
    execute format(
      'create policy "staff_authenticated_all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================================
--  顧客の来店回数・累計売上・平均周期・最終来店日を自動更新するトリガー
--  （施術履歴 treatment_records の追加・変更・削除に連動）
-- ============================================================================
create or replace function recalc_customer_stats() returns trigger
language plpgsql
as $$
declare
  cust_id uuid;
begin
  cust_id := coalesce(new.customer_id, old.customer_id);
  if cust_id is null then
    return coalesce(new, old);
  end if;

  update customers set
    visit_count    = (select count(*) from treatment_records where customer_id = cust_id),
    lifetime_value = (select coalesce(sum(amount), 0) from treatment_records where customer_id = cust_id),
    last_visit_on  = (select max(performed_on) from treatment_records where customer_id = cust_id),
    avg_cycle_days = (
      select case when count(*) > 1
        then round((max(performed_on) - min(performed_on))::numeric / (count(*) - 1))::int
        else null end
      from treatment_records where customer_id = cust_id
    )
  where id = cust_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalc_customer_stats on treatment_records;
create trigger trg_recalc_customer_stats
after insert or update or delete on treatment_records
for each row execute function recalc_customer_stats();
