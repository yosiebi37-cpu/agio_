-- ============================================================================
--  agio — 認証あり構成への移行 / RLS ロックダウン
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  schema.sql / seed.sql の実行後、一度だけ実行すれば OK です。
--
--  やること:
--    これまで anon（未ログインの誰でも）に許可していた全テーブルの読み書きを止め、
--    ログイン済み（authenticated）のスタッフのみに許可するよう RLS ポリシーを差し替えます。
--
--  実行後は、Supabase ダッシュボード → Authentication → Users から
--  スタッフのログインアカウント（メール + パスワード）を作成してください。
--  このアプリには一般公開のサインアップ画面はありません（社内スタッフ専用ツールのため）。
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'staff','customers','bookings','treatment_records',
    'chemical_records','karte_photos','commission_settings'
  ]
  loop
    execute format('drop policy if exists "demo_anon_all" on %I;', t);
    execute format('drop policy if exists "staff_authenticated_all" on %I;', t);
    execute format(
      'create policy "staff_authenticated_all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
