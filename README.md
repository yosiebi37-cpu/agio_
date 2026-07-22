# agio — 美容室ダッシュボード

予約ボード・顧客管理・カルテ（施術履歴／薬剤記録／写真／次回提案）・業務委託の報酬計算を備えた、
美容室向けの管理ダッシュボードです。**Next.js（App Router）** で構築し、**Supabase** にデータを保管、
**Vercel** へのデプロイを想定した構成になっています。

## 技術構成

- **Next.js 15 / React 19 / TypeScript**（App Router）
- **Supabase**（PostgreSQL）— データ保管
- **Vercel** — ホスティング
- アイコン: Tabler Icons（webfont / CDN）、フォント: Cormorant Garamond + DM Sans

```
app/                  画面（ルーティング）
  board/              予約ボード
  customers/          顧客一覧
  karte/[id]/         カルテ詳細
  freelance/          業務委託 報酬計算
components/           UI コンポーネント
lib/                  Supabase クライアント / 型 / 共通関数
supabase/
  schema.sql          テーブル定義（最初に実行・ログイン必須の RLS を含む）
  auth-migration.sql  既存プロジェクトを認証ありに移行する場合に実行
  seed.sql            サンプルデータ（任意・2回目以降も再実行可）
```

## セットアップ

### 1. Supabase プロジェクトを用意

1. [supabase.com](https://supabase.com) でプロジェクトを作成します。
2. ダッシュボードの **SQL Editor** で `supabase/schema.sql` の内容を実行します。
   - すでに `schema.sql` を実行済みのプロジェクト（旧・認証なし構成）を移行する場合は、
     代わりに `supabase/auth-migration.sql` を実行してください。
3. 続けて `supabase/seed.sql` を実行するとサンプルデータが投入されます（任意）。
4. **Project Settings → API** から以下を控えます。
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Authentication → Users** から、スタッフ用のログインアカウント（メールアドレス + パスワード）を
   作成します。このアプリに一般公開のサインアップ画面はなく、アカウントは管理者がここで発行します。

### 2. 環境変数

`.env.example` を `.env.local` にコピーして値を設定します。

```bash
cp .env.example .env.local
# .env.local を編集
```

### 3. ローカル開発

```bash
npm install
npm run dev
# http://localhost:3000
```

環境変数が未設定の場合は、各画面に設定手順の案内が表示されます。

## Vercel へのデプロイ

1. このリポジトリを Vercel にインポートします（フレームワークは Next.js が自動検出されます）。
2. **Settings → Environment Variables** に下記を登録します。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. デプロイすると公開されます。ビルドコマンド・出力ディレクトリは既定のままで動作します。

## データモデル（概要）

| テーブル | 内容 |
| --- | --- |
| `staff` | スタッフ（社員 / 業務委託の区分を含む） |
| `customers` | 顧客（髪質・アレルギー・来店回数などの集計値・次回提案を保持） |
| `bookings` | 予約（日付＋時刻で保持し、タイムゾーンに依存しない） |
| `treatment_records` | 施術履歴（カルテ） |
| `chemical_records` | 薬剤・カラー記録 |
| `karte_photos` | ビフォーアフター写真のメタ（実体は Supabase Storage） |
| `commission_settings` | 業務委託の報酬率（既存客 / 新規客、単一行） |

- 予約ボード・業務委託ページの集計は `bookings` から動的に計算します。
- 業務委託の売上は「`employment_type = 'contract'` のスタッフの当日予約」を区分別に集計し、報酬率を掛けて算出します。

## 認証について

このアプリは **Supabase Auth によるログインが必須**です。未ログインで各画面にアクセスすると
`/login` にリダイレクトされます（`middleware.ts` で制御）。RLS ポリシーもログイン済み
（`authenticated`）のみ読み書き可能に設定済みで、未ログイン（`anon`）からの顧客データ
アクセスはブロックされます。

スタッフアカウントの追加・削除は Supabase ダッシュボード **Authentication → Users** から行います。
スタッフ本体（担当スタイリスト）の追加・編集は、アプリ内の **設定** 画面から行えます。

## テスト / CI

```bash
npm test
```

`lib/format.ts` の日付・金額フォーマッタ等をユニットテストしています（Vitest）。
`.github/workflows/ci.yml` により、push / PR のたびに `npm test` と `npm run build`
（型チェック含む）が自動実行されます。
