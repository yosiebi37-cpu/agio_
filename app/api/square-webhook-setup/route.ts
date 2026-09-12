import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';
const NOTIFICATION_URL = 'https://agio-1vgc.vercel.app/api/square-webhook';

function htmlPage(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Square Webhook 設定</title>
    <style>body{font-family:sans-serif;padding:24px;line-height:1.8;max-width:640px;margin:0 auto;}
    .key{background:#f0f0f0;padding:16px;border-radius:8px;font-size:16px;word-break:break-all;user-select:all;}
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
    return htmlPage('<p>SQUARE_ACCESS_TOKEN がVercelに設定されていません。先に設定してください。</p>');
  }

  const res = await fetch(`${SQUARE_API_BASE}/webhooks/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      idempotency_key: 'agio-square-webhook-setup-v1',
      subscription: {
        name: 'agio予約連携',
        event_types: ['booking.created', 'booking.updated'],
        notification_url: NOTIFICATION_URL,
        api_version: SQUARE_API_VERSION,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return htmlPage(`<p>Squareへの登録に失敗しました。</p><pre>${JSON.stringify(data, null, 2)}</pre>`);
  }

  const signatureKey = data.subscription?.signature_key ?? '(見つかりませんでした)';

  return htmlPage(`
    <h2>Webhookの登録に成功しました！</h2>
    <p>下の「Signature Key」をコピーして、Vercelの環境変数 <b>SQUARE_WEBHOOK_SIGNATURE_KEY</b> に貼り付けてください。</p>
    <div class="key">${signatureKey}</div>
    <p style="margin-top:24px;color:#666;font-size:13px;">Subscription ID: ${data.subscription?.id ?? ''}</p>
  `);
}
