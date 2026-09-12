import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';

function htmlPage(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Square担当者一覧</title>
    <style>body{font-family:sans-serif;padding:24px;line-height:1.8;max-width:640px;margin:0 auto;}
    table{border-collapse:collapse;width:100%;}
    td,th{border-bottom:1px solid #ddd;padding:10px 8px;text-align:left;font-size:14px;}
    .id{font-family:monospace;background:#f0f0f0;padding:4px 8px;border-radius:4px;user-select:all;word-break:break-all;}
    </style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
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

  const res = await fetch(`${SQUARE_API_BASE}/team-members/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({ query: { filter: { status: 'ACTIVE' } } }),
  });

  const data = await res.json();

  if (!res.ok) {
    return htmlPage(`<p>Squareへの問い合わせに失敗しました。</p><pre>${JSON.stringify(data, null, 2)}</pre>`);
  }

  const members = (data.team_members ?? []) as { id: string; given_name?: string; family_name?: string }[];

  if (members.length === 0) {
    return htmlPage('<p>担当者（チームメンバー）が見つかりませんでした。Squareの「従業員」設定を確認してください。</p>');
  }

  const rows = members
    .map(
      (m) => `<tr><td>${m.family_name ?? ''} ${m.given_name ?? ''}</td><td class="id">${m.id}</td></tr>`,
    )
    .join('');

  return htmlPage(`
    <h2>Squareの担当者一覧</h2>
    <p>この一覧の「ID」を、agioの設定画面 → スタッフ管理 → 該当スタッフの「編集」→「Square担当者ID」に貼り付けてください。</p>
    <table><tr><th>名前</th><th>ID</th></tr>${rows}</table>
  `);
}
