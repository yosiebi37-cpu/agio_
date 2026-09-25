import { NextResponse } from 'next/server';
import { verifyLineSignature, sendLineReplyMessage } from '@/lib/line';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

/**
 * LINE公式アカウントへのメッセージを受け取るWebhook。
 * 今のところ「自分のLINEユーザーIDを知りたい時に、ボットにメッセージを送ると
 * そのユーザーIDを返信する」という用途だけに使う（予約通知の送り先を
 * 設定するための、最初の一回だけの下準備）。
 */
export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const rawBody = await request.text();

  if (!channelSecret || !accessToken) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-line-signature');
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody).events ?? []) as LineEvent[];
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    if (event.type === 'message' && event.message?.type === 'text' && event.replyToken && event.source?.userId) {
      const userId = event.source.userId;
      await sendLineReplyMessage(
        event.replyToken,
        `あなたのLINEユーザーIDは：\n${userId}\n\nこのIDを控えて、agioの開発担当（Claude）に伝えてください。`,
        accessToken,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
