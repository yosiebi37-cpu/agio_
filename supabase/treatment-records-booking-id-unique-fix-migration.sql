-- ============================================================================
--  予約ボードで「来店済みに」を押した時／予約の編集を保存した時に、
--  施術記録（カルテの施術履歴）へ自動反映されない不具合の修正。
--
--  原因：treatment_records.booking_id の一意インデックスが
--  「where booking_id is not null」の部分インデックスだったため、
--  upsert の on_conflict:'booking_id' が一致するインデックスを見つけられず、
--  毎回サイレントに失敗していた（画面にはエラーが出ない）。
--  部分インデックスを、通常の（部分的でない）一意インデックスに変更する。
--  ※ nullは元々複数行あってもよい仕様だが、通常のunique indexでも
--  　postgresはnull同士を別物として扱うため、この変更で挙動は変わらない。
-- ============================================================================

drop index if exists treatment_records_booking_id_idx;
create unique index if not exists treatment_records_booking_id_idx on treatment_records (booking_id);
