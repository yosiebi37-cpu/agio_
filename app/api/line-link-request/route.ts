import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifyLiffAccessToken, sendLinePushMessage } from '@/lib/line';
import { findMatchingCustomer, normalizePhone, type MatchCandidate } from '@/lib/customer-match';

interface RequestBody {
  accessToken?: string;
  name?: string;
  furigana?: string;
  phone?: string;
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * LINEの「予約確認」ページからの「連携申請」を受け付けるAPI。
 * お店・電話・ホットペッパーで予約したお客様は、LINEとお客様情報がつながっていないため、
 * お名前と電話番号で申請してもらい、スタッフが顧客管理画面で確認・承認してからつなぐ。
 * （電話番号だけで自動的につなぐと、他人になりすまして予約を変更・キャンセルできてしまうため）
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const name = (body?.name ?? '').trim();
  const furigana = (body?.furigana ?? '').trim();
  const phone = (body?.phone ?? '').trim();
  if (!body?.accessToken) return fail('LINEアプリから、もう一度開いてください。', 400);
  if (!name || name.length > 40) return fail('お名前を入力してください。', 400);
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) return fail('電話番号を正しく入力してください。', 400);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) return fail('LINEの設定が完了していません。店舗までご連絡ください。', 500);
  const lineUserId = await verifyLiffAccessToken(body.accessToken, liffId);
  if (!lineUserId) return fail('LINEでのログインを確認できませんでした。LINEアプリからもう一度開いてください。', 401);

  const sb = getServiceSupabase();

  // すでにつながっている場合は申請不要
  const { data: linked } = await sb.from('customers').select('id').eq('line_user_id', lineUserId).limit(1);
  if ((linked ?? []).length > 0) return NextResponse.json({ ok: true, alreadyLinked: true });

  // LINEの表示名（スタッフが確認するときの参考。取れなくても続行）
  let displayName: string | null = null;
  try {
    const res = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${body.accessToken}` } });
    if (res.ok) displayName = ((await res.json()) as { displayName?: string }).displayName ?? null;
  } catch {
    // 表示名は参考情報なので、取れなくても申請は受け付ける
  }

  // 入力されたお名前・電話番号から、どのお客様かの候補を探しておく（最終的な判断はスタッフ）
  const { data: customerRows } = await sb
    .from('customers')
    .select('id,name,furigana,phone,line_user_id,customer_type,visit_count');
  const match = findMatchingCustomer((customerRows ?? []) as MatchCandidate[], { phone, name, furigana });
  const suggested = match?.customer ?? null;

  const row = {
    line_user_id: lineUserId,
    line_display_name: displayName,
    name,
    furigana: furigana || null,
    phone,
    suggested_customer_id: suggested?.id ?? null,
  };

  // 同じLINEからの申請が確認待ちで残っていれば、新しく作らずに内容を更新する
  const { data: pending } = await sb
    .from('line_link_requests')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  const { error } = pending
    ? await sb.from('line_link_requests').update({ ...row, created_at: new Date().toISOString() }).eq('id', pending.id)
    : await sb.from('line_link_requests').insert(row);
  if (error) {
    console.error('[line-link-request] save failed', error);
    return fail('申請を受け付けられませんでした。お手数ですが、このLINEのトークでお問い合わせください。', 500);
  }

  // オーナーのLINEに、申請が来たことを知らせる（失敗しても申請は受け付け済み）
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID?.trim();
  const ownerToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (ownerLineUserId && ownerToken) {
    const text = `【LINE連携の申請】\n${name} 様\n電話：${phone}\n候補：${suggested ? suggested.name : '自動では見つかりませんでした'}\n\n予約管理の「顧客管理」画面で確認・承認してください。`;
    try {
      await sendLinePushMessage(ownerLineUserId, text, ownerToken);
    } catch (e) {
      console.error('[line-link-request] owner notify failed', e);
    }
  }

  return NextResponse.json({ ok: true });
}
