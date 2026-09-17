import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifySquareSignature, type SquareWebhookEvent } from '@/lib/square';

/**
 * Square予約ページからの予約をagioへ取り込む処理は停止中（agio自身の予約ページ
 * /book, /book/line に一本化したため、二重登録を防ぐ目的で無効化している）。
 * agioからSquareへの反映（HotPepper予約の登録・agioからのキャンセル）は
 * この停止の影響を受けない。再度取り込みたくなった場合は、過去のコミット履歴から
 * このファイルの以前の実装を復元すれば元の動作に戻せる。
 */
export async function POST(request: Request) {
  const signingKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL;
  const rawBody = await request.text();

  if (!signingKey || !notificationUrl) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-square-hmacsha256-signature');
  if (!verifySquareSignature(rawBody, signature, notificationUrl, signingKey)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  let eventType = 'unknown';
  try {
    eventType = (JSON.parse(rawBody) as SquareWebhookEvent).type ?? 'unknown';
  } catch {
    // 解析できなくてもログだけ残して終了する
  }

  const sb = getServiceSupabase();
  await sb.from('square_sync_log').insert({
    event_type: eventType,
    raw_body: rawBody,
    result: 'skipped',
    message: 'Square予約ページからagioへの取り込みは現在停止しています',
  });
  return NextResponse.json({ ok: true });
}
