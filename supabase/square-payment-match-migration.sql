-- ============================================================================
--  Squareで会計したら、予約ボードの予約を自動で「来店済み」にする
--  （Squareの会計を記録して、どの予約の会計かを照らし合わせるための表）
--  Supabaseの SQL Editor にこの内容を貼り付けて「Run」を押してください。
-- ============================================================================

create table if not exists square_payments (
  id                uuid primary key default gen_random_uuid(),
  square_payment_id text not null unique,
  amount            int not null default 0,          -- 円（店販込みの会計金額）
  paid_on           date not null,                   -- 会計した日（日本時間）
  paid_time         time not null,                   -- 会計した時刻（日本時間）
  booking_id        uuid references bookings(id) on delete set null,
  match_status      text not null default 'needs_review'
                      check (match_status in ('matched', 'needs_review', 'ignored')),
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists square_payments_paid_on_idx on square_payments (paid_on);

alter table square_payments enable row level security;
drop policy if exists "staff_authenticated_all" on square_payments;
create policy "staff_authenticated_all" on square_payments for all to authenticated using (true) with check (true);
