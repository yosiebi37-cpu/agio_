import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifyLiffAccessToken, sendLinePushMessage, isLineFriend, lineAddFriendUrl, manageBookingUrl } from '@/lib/line';
import { jstNow } from '@/lib/booking-manage';
import { hhmm, formatDateLong } from '@/lib/format';

interface LinkBody {
  accessToken?: string;
  bookingId?: string;
  /** 「友だち追加しました」を押して、もう一度確認するとき */
  recheck?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * お店で受けた予約のお客様が、予約画面に出したQRコードからLINEを連携するためのAPI。
 * QRコードに入っている予約ID（推測できない長いID）と、LIFFで確認したLINEユーザーIDを使って、
 * その予約のお客様（顧客データ）にLINEユーザーIDを保存する。
 * 保存後は、前日リマインダー（/api/line-reminder-cron）が予約の入り方に関係なく届くようになる。
 * 他の人に勝手に連携されないよう、使えるのは「これからの予約」のQRコードだけで、
 * すでに別のLINEと連携済みのお客様は上書きしない（店舗で解除してからやり直す）。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LinkBody | null;
  if (!body?.accessToken || !body.bookingId || !UUID_RE.test(body.bookingId)) {
    return fail('QRコードを読み取り直してください。', 400);
  }

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) return fail('LINEの設定が完了していません。店舗スタッフにお声がけください。', 500);

  const lineUserId = await verifyLiffAccessToken(body.accessToken, liffId);
  if (!lineUserId) return fail('LINEでのログインを確認できませんでした。LINEアプリからもう一度QRコードを読み取ってください。', 401);

  const sb = getServiceSupabase();
  const today = jstNow(Date.now()).date;

  const { data: booking } = await sb
    .from('bookings')
    .select('id,customer_id,customer_name,booking_date,start_time,menu,status')
    .eq('id', body.bookingId)
    .maybeSingle();
  if (!booking || !booking.customer_id || booking.status === 'visited' || booking.booking_date < today) {
    return fail('このQRコードは使えなくなっています。お手数ですが、店舗スタッフにお声がけください。', 404);
  }

  const { data: customer } = await sb
    .from('customers')
    .select('id,line_user_id')
    .eq('id', booking.customer_id)
    .maybeSingle();
  if (!customer) return fail('お客様情報が見つかりません。店舗スタッフにお声がけください。', 404);
  if (customer.line_user_id && customer.line_user_id !== lineUserId) {
    return fail('このお客様は、すでに別のLINEと連携されています。店舗スタッフにお声がけください。', 409);
  }

  const newlyLinked = customer.line_user_id !== lineUserId;
  if (newlyLinked) {
    const { error } = await sb.from('customers').update({ line_user_id: lineUserId }).eq('id', customer.id);
    if (error) return fail('連携に失敗しました。もう一度お試しいただくか、店舗スタッフにお声がけください。', 500);
  }

  const dateLabel = formatDateLong(booking.booking_date);
  const startTime = hhmm(booking.start_time);

  // 公式アカウントを友だち追加していないと、リマインドが届かない。追加済みかを確認し、
  // 未追加なら友だち追加のURLを返して、画面で案内する
  const token = process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim();
  let friend = false;
  let addFriendUrl: string | null = null;
  if (token) {
    friend = await isLineFriend(lineUserId, token).catch(() => false);
    if (!friend) addFriendUrl = await lineAddFriendUrl(token).catch(() => null);
  }

  // 連携できたことを、お客様のLINEのトークにも残しておく（友だち追加済みのときだけ。連携した最初の一回）
  if (token && friend && (newlyLinked || body.recheck)) {
    const manageUrl = manageBookingUrl();
    const text = `【LINE連携が完了しました】\n${booking.customer_name} 様\n\n次回のご予約：${dateLabel} ${startTime}〜\nメニュー：${booking.menu}\n\nご予約の前日に、こちらのLINEでお知らせをお送りします。${manageUrl ? `\n\n▼ご予約の確認・日時変更・キャンセルはこちら\n${manageUrl}` : ''}`;
    try {
      await sendLinePushMessage(lineUserId, text, token);
    } catch (e) {
      // 送信に失敗しても、連携自体はできているので処理は続ける（原因調査のためログだけ残す）
      console.error('[line-link] confirmation push failed', booking.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    name: booking.customer_name,
    date: dateLabel,
    startTime,
    menu: booking.menu,
    friend,
    addFriendUrl,
  });
}
