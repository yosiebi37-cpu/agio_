-- ============================================================================
--  agio — カルテ写真用の Supabase Storage バケットを作成
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  一度実行すれば十分です（再実行しても安全です）。
--
--  注意: バケットは public（写真の URL を知っていれば誰でも閲覧可）で作成します。
--    アップロード・削除などの操作自体は、これまでと同様ログイン済みユーザーのみ
--    可能に制限しています。URL は推測困難なランダムな文字列を含みます。
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('karte-photos', 'karte-photos', true)
on conflict (id) do nothing;

drop policy if exists "karte_photos_authenticated_all" on storage.objects;
create policy "karte_photos_authenticated_all" on storage.objects
for all to authenticated
using (bucket_id = 'karte-photos')
with check (bucket_id = 'karte-photos');
