import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifyLiffAccessToken } from '@/lib/line';
import { splitPersonName } from '@/lib/customer-match';

/**
 * LINE予約ページ（/book/line）で、前回入力したお名前・電話番号を自動で入れるためのAPI。
 * LIFFのアクセストークンをLINEのサーバーで検証してから、そのLINEユーザーに連携済みのお客様だけを返す
 * （他の人のLINEユーザーIDを送りつけても、他のお客様の情報は取れない）。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accessToken?: string } | null;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!body?.accessToken || !liffId) return NextResponse.json({ found: false });

  const lineUserId = await verifyLiffAccessToken(body.accessToken, liffId);
  if (!lineUserId) return NextResponse.json({ found: false }, { status: 401 });

  const sb = getServiceSupabase();
  const { data } = await sb
    .from('customers')
    .select('name,furigana,phone,customer_type,visit_count')
    .eq('line_user_id', lineUserId);
  const rows = (data ?? []) as { name: string; furigana: string | null; phone: string | null; customer_type: string | null; visit_count: number | null }[];
  if (!rows.length) return NextResponse.json({ found: false });

  // 万一同じLINEに複数のカルテがつながっていたら、既存客 → 来店回数が多い方を使う
  const c = [...rows].sort((a, b) => {
    const t = (x: typeof a) => (x.customer_type === 'existing' ? 1 : 0);
    if (t(b) !== t(a)) return t(b) - t(a);
    return (b.visit_count ?? 0) - (a.visit_count ?? 0);
  })[0];

  const name = splitPersonName(c.name);
  const kana = splitPersonName(c.furigana);
  return NextResponse.json({
    found: true,
    lastName: name.last,
    firstName: name.first,
    lastKana: kana.last,
    firstKana: kana.first,
    phone: (c.phone ?? '').trim(),
  });
}
