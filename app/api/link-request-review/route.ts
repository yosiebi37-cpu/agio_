import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { sendLinePushMessage, manageBookingUrl } from '@/lib/line';
import { jstNow } from '@/lib/booking-manage';
import { hhmm, formatDateLong } from '@/lib/format';

interface ReviewBody {
  requestId?: string;
  action?: 'approve' | 'reject';
  customerId?: string;
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** お客様のLINEにお知らせを送る（失敗しても、承認・却下の処理自体は完了しているので止めない） */
async function notifyCustomer(lineUserId: string, text: string): Promise<void> {
  const token = process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return;
  try {
    await sendLinePushMessage(lineUserId, text, token);
  } catch (e) {
    console.error('[link-request-review] customer notify failed', e);
  }
}

/**
 * スタッフが顧客管理画面で、LINEからの「連携申請」を承認・却下するAPI（ログイン中のスタッフのみ）。
 * 承認すると、選んだお客様にLINEユーザーIDを保存し、お客様のLINEに完了をお知らせする。
 */
export async function POST(request: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('ログインしてください。', 401);

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  if (!body?.requestId || (body.action !== 'approve' && body.action !== 'reject')) {
    return fail('リクエストの形式が正しくありません。', 400);
  }

  const { data: req } = await sb
    .from('line_link_requests')
    .select('id,line_user_id,status')
    .eq('id', body.requestId)
    .maybeSingle();
  if (!req) return fail('申請が見つかりません。', 404);
  if (req.status !== 'pending') return fail('この申請はすでに処理されています。', 409);

  const resolvedAt = new Date().toISOString();

  if (body.action === 'reject') {
    const { error } = await sb
      .from('line_link_requests')
      .update({ status: 'rejected', resolved_at: resolvedAt })
      .eq('id', req.id);
    if (error) return fail(error.message, 500);
    await notifyCustomer(
      req.line_user_id,
      '【LINE連携について】\nお送りいただいた内容では、お客様情報を確認できませんでした。\nお手数ですが、ご来店時にスタッフへお声がけいただくか、このトークでお問い合わせください。',
    );
    return NextResponse.json({ ok: true });
  }

  if (!body.customerId) return fail('どのお客様か選んでください。', 400);
  const { data: customer } = await sb.from('customers').select('id,name').eq('id', body.customerId).maybeSingle();
  if (!customer) return fail('お客様が見つかりません。', 404);

  const { error: linkError } = await sb.from('customers').update({ line_user_id: req.line_user_id }).eq('id', customer.id);
  if (linkError) return fail(linkError.message, 500);
  await sb
    .from('line_link_requests')
    .update({ status: 'approved', customer_id: customer.id, resolved_at: resolvedAt })
    .eq('id', req.id);

  // 次回のご予約があれば、完了のお知らせに一緒に載せる
  const today = jstNow(Date.now()).date;
  const { data: next } = await sb
    .from('bookings')
    .select('booking_date,start_time,menu')
    .eq('customer_id', customer.id)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .order('booking_date')
    .order('start_time')
    .limit(1)
    .maybeSingle();

  const manageUrl = manageBookingUrl();
  const nextText = next ? `次回のご予約：${formatDateLong(next.booking_date)} ${hhmm(next.start_time)}〜\nメニュー：${next.menu}\n\n` : '';
  await notifyCustomer(
    req.line_user_id,
    `【LINE連携が完了しました】\n${customer.name} 様\n\n${nextText}これからは、ご予約の前日にこちらのLINEでお知らせをお送りします。${manageUrl ? `\n\n▼ご予約の確認・日時変更・キャンセルはこちら\n${manageUrl}` : ''}`,
  );

  return NextResponse.json({ ok: true });
}
