import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';

function htmlPage(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Squareメニュー一覧</title>
    <style>body{font-family:sans-serif;padding:24px;line-height:1.8;max-width:640px;margin:0 auto;}
    table{border-collapse:collapse;width:100%;}
    td,th{border-bottom:1px solid #ddd;padding:10px 8px;text-align:left;font-size:14px;}
    .id{font-family:monospace;background:#f0f0f0;padding:4px 8px;border-radius:4px;user-select:all;word-break:break-all;}
    </style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

interface CatalogVariation {
  id: string;
  item_variation_data?: { name?: string };
}

interface CatalogItem {
  item_data?: { name?: string; variations?: CatalogVariation[] };
}

export async function GET() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return htmlPage('<p>ログインが必要です。agioにログインした状態でこのページを開いてください。</p>');
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    return htmlPage('<p>SQUARE_ACCESS_TOKEN がVercelに設定されていません。</p>');
  }

  const res = await fetch(`${SQUARE_API_BASE}/catalog/list?types=ITEM`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION },
  });
  const data = await res.json();

  if (!res.ok) {
    return htmlPage(`<p>Squareへの問い合わせに失敗しました。</p><pre>${JSON.stringify(data, null, 2)}</pre>`);
  }

  const items = (data.objects ?? []) as CatalogItem[];
  const rows: string[] = [];
  for (const item of items) {
    for (const v of item.item_data?.variations ?? []) {
      const label = [item.item_data?.name, v.item_variation_data?.name].filter(Boolean).join(' - ');
      rows.push(`<tr><td>${label}</td><td class="id">${v.id}</td></tr>`);
    }
  }

  if (rows.length === 0) {
    return htmlPage('<p>Squareのサービス（メニュー）が見つかりませんでした。「サービスと商品」の設定を確認してください。</p>');
  }

  return htmlPage(`
    <h2>Squareのメニュー（サービス）一覧</h2>
    <p>この一覧の「ID」を、agioの設定画面 → 施術メニューの一覧の中にある「Square ID」欄に貼り付けてください。同じ内容のメニューに対応するものを選んでください。</p>
    <table><tr><th>メニュー名</th><th>ID</th></tr>${rows.join('')}</table>
  `);
}
