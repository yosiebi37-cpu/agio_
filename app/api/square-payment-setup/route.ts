import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSquareLocationId } from '@/lib/square';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';
const NOTIFICATION_URL = 'https://agio-1vgc.vercel.app/api/square-webhook';
const EVENT_TYPES = ['booking.created', 'booking.updated', 'payment.created', 'payment.updated'];

function htmlPage(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Square 会計連携の設定</title>
    <style>body{font-family:sans-serif;padding:24px;line-height:1.8;max-width:680px;margin:0 auto;}
    .key{background:#f0f0f0;padding:16px;border-radius:8px;font-size:16px;word-break:break-all;user-select:all;}
    .ok{color:#1b7f3b;font-weight:bold;} .ng{color:#b42318;font-weight:bold;}
    td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:14px;}
    </style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/**
 * Squareで会計したら予約ボードを自動で「来店済み」にするための設定ページ。
 * 既存のWebhook（予約連携）に「会計」のお知らせを追加する。まだWebhookがなければ新しく作る。
 */
export async function GET() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return htmlPage('<p>ログインが必要です。agioにログインした状態でこのページを開いてください。</p>');

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) return htmlPage('<p class="ng">SQUARE_ACCESS_TOKEN がVercelに設定されていません。</p>');

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_API_VERSION,
  };
  const parts: string[] = ['<h2>Square 会計連携の設定</h2>'];

  // 1. 店舗（ロケーション）の確認
  const locRes = await fetch(`${SQUARE_API_BASE}/locations`, { headers });
  const locData = await locRes.json().catch(() => ({}));
  const agioLocation = process.env.SQUARE_LOCATION_ID?.trim() || (await getSquareLocationId(accessToken));
  const locations = (locData.locations ?? []) as { id: string; name?: string; status?: string }[];
  parts.push('<h3>① 会計を見る店舗</h3><table><tr><th>店舗名</th><th>状態</th><th></th></tr>');
  for (const l of locations) {
    parts.push(
      `<tr><td>${esc(l.name ?? l.id)}</td><td>${esc(l.status ?? '')}</td><td>${l.id === agioLocation ? '<span class="ok">← この店舗の会計だけを見ます</span>' : ''}</td></tr>`,
    );
  }
  parts.push('</table>');

  // 2. Webhook（お知らせ）の設定
  parts.push('<h3>② Squareからのお知らせ</h3>');
  const listRes = await fetch(`${SQUARE_API_BASE}/webhooks/subscriptions`, { headers });
  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) {
    parts.push(`<p class="ng">お知らせの一覧を取得できませんでした。</p><pre>${esc(JSON.stringify(listData, null, 2))}</pre>`);
    return htmlPage(parts.join(''));
  }
  const subs = (listData.subscriptions ?? []) as { id: string; notification_url?: string; event_types?: string[] }[];
  const existing = subs.find((s) => s.notification_url === NOTIFICATION_URL);

  if (existing) {
    const merged = Array.from(new Set([...(existing.event_types ?? []), ...EVENT_TYPES]));
    const updRes = await fetch(`${SQUARE_API_BASE}/webhooks/subscriptions/${existing.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ subscription: { event_types: merged, enabled: true } }),
    });
    const updData = await updRes.json().catch(() => ({}));
    if (!updRes.ok) {
      parts.push(`<p class="ng">お知らせの設定に失敗しました。</p><pre>${esc(JSON.stringify(updData, null, 2))}</pre>`);
      return htmlPage(parts.join(''));
    }
    parts.push(`<p class="ok">会計のお知らせを追加しました。</p><p>受け取るお知らせ：${esc(merged.join(', '))}</p>`);
  } else {
    const createRes = await fetch(`${SQUARE_API_BASE}/webhooks/subscriptions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotency_key: 'agio-square-webhook-setup-v2-payments',
        subscription: {
          name: 'agio予約・会計連携',
          event_types: EVENT_TYPES,
          notification_url: NOTIFICATION_URL,
          api_version: SQUARE_API_VERSION,
        },
      }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      parts.push(`<p class="ng">お知らせの登録に失敗しました。</p><pre>${esc(JSON.stringify(createData, null, 2))}</pre>`);
      return htmlPage(parts.join(''));
    }
    const signatureKey = createData.subscription?.signature_key ?? '(見つかりませんでした)';
    parts.push(
      `<p class="ok">お知らせを新しく登録しました。</p>
      <p>下の「Signature Key」をコピーして、Vercelの環境変数 <b>SQUARE_WEBHOOK_SIGNATURE_KEY</b> に貼り付けてください。<br>
      あわせて <b>SQUARE_WEBHOOK_URL</b> に <code>${NOTIFICATION_URL}</code> を設定してください。</p>
      <div class="key">${esc(signatureKey)}</div>`,
    );
  }

  // 3. 受け取り側（Vercelの環境変数）の確認
  const hasKey = Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
  const hasUrl = Boolean(process.env.SQUARE_WEBHOOK_URL);
  parts.push(
    `<h3>③ 予約ボード側の準備</h3>
    <p>SQUARE_WEBHOOK_SIGNATURE_KEY：${hasKey ? '<span class="ok">設定済み</span>' : '<span class="ng">未設定</span>'}<br>
    SQUARE_WEBHOOK_URL：${hasUrl ? '<span class="ok">設定済み</span>' : '<span class="ng">未設定</span>'}</p>`,
  );

  return htmlPage(parts.join(''));
}
