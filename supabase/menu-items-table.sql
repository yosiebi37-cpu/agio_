-- 施術メニュー一覧（予約・カルテ登録時に選べるメニューと基本料金）
-- 既存プロジェクトに1度だけ適用するマイグレーション

create table if not exists menu_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      int not null default 0,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table menu_items enable row level security;

drop policy if exists "staff_authenticated_all" on menu_items;
create policy "staff_authenticated_all" on menu_items for all to authenticated using (true) with check (true);

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
