import crypto from 'crypto';

// Square Appointments の Webhook（予約作成・更新イベント）の署名検証と本文解析

export function verifySquareSignature(
  rawBody: string,
  signatureHeader: string | null,
  notificationUrl: string,
  signingKey: string,
): boolean {
  if (!signatureHeader || !signingKey) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(notificationUrl + rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Square の start_at（UTCのISO文字列）を、日本時間の日付・時刻に変換する */
export function utcIsoToJst(iso: string): { date: string; time: string } {
  const utc = new Date(iso);
  const jst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const mi = String(jst.getUTCMinutes()).padStart(2, '0');
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

export function isBookingCancelled(status: string): boolean {
  return status.startsWith('CANCELLED') || status === 'DECLINED';
}

export interface SquareBookingSegment {
  team_member_id?: string;
  service_variation_id?: string;
  duration_minutes?: number;
}

export interface SquareBooking {
  id: string;
  status: string;
  start_at: string;
  customer_id?: string;
  appointment_segments?: SquareBookingSegment[];
}

export interface SquareWebhookEvent {
  type: string;
  data?: {
    object?: {
      booking?: SquareBooking;
    };
  };
}

export function extractBooking(payload: SquareWebhookEvent): SquareBooking | null {
  return payload.data?.object?.booking ?? null;
}
