-- ============================================================================
--  Atelier — 美容室ダッシュボード  /  Supabase スキーマ定義
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  実行後に seed.sql を実行するとサンプルデータが投入されます。
--
--  ⚠️ セキュリティに関する重要な注意（認証なし構成）
--    本構成はログイン認証を設けていません。下記の RLS ポリシーは anon キー
--    （ブラウザに公開されるキー）からの読み書きをすべて許可しています。
--    顧客の電話番号・生年月日・アレルギー歴などの個人情報を扱うため、
--    一般公開する前に必ず Supabase Auth + RLS でアクセス制限を行ってください。
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
  amount        int not null default 0,                     -- 施術売上 円
  shop_amount   int not null default 0,                     -- 店販売上 円
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
-- 業務委託の報酬率（単一行設定）
-- ---------------------------------------------------------------------------
create table if not exists commission_settings (
  id            int primary key default 1,
  existing_rate int not null default 60,                    -- 既存客 報酬率 %
  new_rate      int not null default 50,                    -- 新規客 報酬率 %
  updated_at    timestamptz not null default now(),
  constraint commission_single_row check (id = 1)
);

-- ============================================================================
--  Row Level Security
--  ⚠️ 認証なし構成のため anon に全権限を付与しています（デモ用）。
--     本番では必ず制限してください。
-- ============================================================================
alter table staff               enable row level security;
alter table customers           enable row level security;
alter table bookings            enable row level security;
alter table treatment_records   enable row level security;
alter table chemical_records    enable row level security;
alter table karte_photos        enable row level security;
alter table commission_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','customers','bookings','treatment_records',
    'chemical_records','karte_photos','commission_settings'
  ]
  loop
    execute format(
      'drop policy if exists "demo_anon_all" on %I;', t);
    execute format(
      'create policy "demo_anon_all" on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 既存DBへの追加カラム（初回実行済みの場合はこちらを SQL Editor で実行）
-- ---------------------------------------------------------------------------
alter table bookings add column if not exists shop_amount int not null default 0;
