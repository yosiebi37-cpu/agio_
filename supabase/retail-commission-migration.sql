-- 店販報酬率を業務委託の報酬設定に追加
-- 既存プロジェクトに1度だけ適用するマイグレーション

alter table commission_settings
  add column if not exists retail_rate int not null default 20;
