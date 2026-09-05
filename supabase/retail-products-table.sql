-- ============================================================================
--  店販商品マスタ（店販の商品を事前登録して、商品別に集計できるようにする）
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

create table if not exists retail_products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      int not null default 0,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table retail_products enable row level security;
drop policy if exists "staff_authenticated_all" on retail_products;
create policy "retail_products_select_all" on retail_products for select to authenticated using (true);
create policy "retail_products_admin_insert" on retail_products for insert to authenticated with check (is_admin());
create policy "retail_products_admin_update" on retail_products for update to authenticated using (is_admin()) with check (is_admin());
create policy "retail_products_admin_delete" on retail_products for delete to authenticated using (is_admin());
