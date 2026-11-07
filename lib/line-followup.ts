import { addDays } from '@/lib/format';

/**
 * 来店後のLINE自動メッセージ。
 * ① 来店の翌日：お礼
 * ② 来店から45日後：メンテナンス時期のご案内（その日以降に次の予約が入っていない方だけ）
 * ③ 来店から90日後：おかえりなさいのご案内（その日以降に次の予約が入っていない方だけ）
 * 送るかどうかの判断はこのファイルの関数で行い、送信と記録は line-reminder-cron で行う。
 */

export type FollowupKind = 'thanks' | 'followup45' | 'followup90';

export const FOLLOWUP_DAYS: Record<FollowupKind, number> = { thanks: 1, followup45: 45, followup90: 90 };

export const FOLLOWUP_SENT_COLUMN: Record<FollowupKind, 'line_thanks_sent_at' | 'line_followup45_sent_at' | 'line_followup90_sent_at'> = {
  thanks: 'line_thanks_sent_at',
  followup45: 'line_followup45_sent_at',
  followup90: 'line_followup90_sent_at',
};

/** その種類のメッセージを送る対象になる「来店日」（今日からN日前） */
export function visitDateFor(kind: FollowupKind, today: string): string {
  return addDays(today, -FOLLOWUP_DAYS[kind]);
}

export interface CustomerBookingForFollowup {
  booking_date: string;
  status: string;
}

/**
 * ②③を送ってよいか。来店日より後に、別の予約（来店済み・予約中どちらも）が入っていたら送らない。
 * （その後もう一度来店している方や、次の予約を入れている方に「そろそろいかがですか」は送らない）
 */
export function shouldSendFollowup(visitDate: string, otherBookings: CustomerBookingForFollowup[]): boolean {
  return !otherBookings.some((b) => b.booking_date > visitDate);
}

export function buildFollowupMessage(kind: FollowupKind, customerName: string, bookingUrl: string | null): string {
  const name = `${customerName.replace(/\s*様$/, '')}様`;
  const link = bookingUrl ? `\n\n▼LINE限定価格でのご予約はこちら\n${bookingUrl}` : '';
  switch (kind) {
    case 'thanks':
      return `【agio hair&spa】\n${name}、昨日はご来店ありがとうございました。\n\n仕上がりはいかがですか？ご自宅でのスタイリングで気になることがあれば、このLINEにお気軽にご連絡ください。\n\nまたお会いできるのを楽しみにしています。`;
    case 'followup45':
      return `【agio hair&spa】\n${name}、その後、ヘアスタイルはいかがでしょうか？\n\n前回のご来店から1ヶ月半ほどたちました。根元の伸びや毛先のまとまりは気になっていませんか？\n髪が一番きれいに見えるのは、このくらいの時期のメンテナンスです。${link}`;
    case 'followup90':
      return `【agio hair&spa】\n${name}、その後、髪の調子はいかがですか？\n\n前回のご来店から3ヶ月ほどたちました。髪のことで気になることや、試してみたいスタイルがあれば、いつでもご相談ください。\nまたお会いできるのを楽しみにしています。${link}`;
  }
}
