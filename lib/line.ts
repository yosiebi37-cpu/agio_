import crypto from 'crypto';

/** LINEからのWebhookリクエストが本物か検証する（チャネルシークレットを使った署名照合） */
export function verifyLineSignature(rawBody: string, signatureHeader: string | null, channelSecret: string): boolean {
  if (!signatureHeader || !channelSecret) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** 指定したLINEユーザーにテキストメッセージをプッシュ送信する */
export async function sendLinePushMessage(userId: string, text: string, accessToken: string): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

/**
 * LIFFで取得したアクセストークンが、このLIFFアプリ（LINEログインチャネル）のものかを
 * LINE側に問い合わせて確認し、本物ならLINEのユーザーIDを返す。
 * ブラウザから送られてきたユーザーIDをそのまま信用すると、他人になりすませてしまうため、
 * 必ずサーバー側でこの確認を通す。
 */
export async function verifyLiffAccessToken(accessToken: string, liffId: string): Promise<string | null> {
  const channelId = liffId.split('-')[0];
  if (!accessToken || !channelId) return null;

  const verifyRes = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`);
  if (!verifyRes.ok) return null;
  const verified = (await verifyRes.json().catch(() => null)) as { client_id?: string; expires_in?: number } | null;
  if (!verified || String(verified.client_id) !== channelId || !(Number(verified.expires_in) > 0)) return null;

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return null;
  const profile = (await profileRes.json().catch(() => null)) as { userId?: string } | null;
  return profile?.userId ?? null;
}

/** お客様がLINEの中で予約の確認・変更を開くためのURL（LIFFのエンドポイント配下の /manage を開く） */
export function manageBookingUrl(): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  return liffId ? `https://liff.line.me/${liffId}/manage` : null;
}

/** Webhookで受け取ったメッセージへの返信（トーク画面にそのまま表示される） */
export async function sendLineReplyMessage(replyToken: string, text: string, accessToken: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

/** お客様がLINE公式アカウントを友だち追加しているか（ブロック中・未追加なら false） */
export async function isLineFriend(userId: string, accessToken: string): Promise<boolean> {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

/** LINE公式アカウントの「友だち追加」ページのURL。取得できなければ null */
export async function lineAddFriendUrl(accessToken: string): Promise<string | null> {
  const res = await fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const info = (await res.json().catch(() => null)) as { basicId?: string } | null;
  return info?.basicId ? `https://line.me/R/ti/p/${encodeURIComponent(info.basicId)}` : null;
}
