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

// ---------------------------------------------------------------------------
// Square API 呼び出し（HotPepper予約をSquareにも登録する / agioからのキャンセルをSquareに伝える用）
// サーバー専用（SQUARE_ACCESS_TOKENを使うため、ブラウザ側からは呼び出さないこと）
// ---------------------------------------------------------------------------

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';

export async function getSquareLocationId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${SQUARE_API_BASE}/locations`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const locations = data.locations as { id: string; status?: string }[] | undefined;
  return locations?.find((l) => l.status === 'ACTIVE')?.id ?? locations?.[0]?.id ?? null;
}

export async function createSquareCustomer(
  accessToken: string,
  name: string,
  idempotencyKey: string,
): Promise<string | null> {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const givenName = parts[0] ?? name;
  const familyName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  const res = await fetch(`${SQUARE_API_BASE}/customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({ idempotency_key: idempotencyKey, given_name: givenName, family_name: familyName }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.customer?.id ?? null;
}

export interface CreateSquareBookingParams {
  locationId: string;
  customerId: string;
  teamMemberId: string;
  serviceVariationId: string;
  startAtIso: string;
  durationMinutes: number;
  idempotencyKey: string;
}

export async function createSquareBooking(
  accessToken: string,
  params: CreateSquareBookingParams,
): Promise<string | null> {
  const res = await fetch(`${SQUARE_API_BASE}/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      idempotency_key: params.idempotencyKey,
      booking: {
        location_id: params.locationId,
        customer_id: params.customerId,
        start_at: params.startAtIso,
        appointment_segments: [
          {
            team_member_id: params.teamMemberId,
            service_variation_id: params.serviceVariationId,
            service_variation_version: 1,
            duration_minutes: params.durationMinutes,
          },
        ],
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.booking?.id ?? null;
}

export async function cancelSquareBookingById(accessToken: string, squareBookingId: string): Promise<boolean> {
  const getRes = await fetch(`${SQUARE_API_BASE}/bookings/${squareBookingId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION },
  });
  if (!getRes.ok) return false;
  const getData = await getRes.json();
  const version = getData.booking?.version;
  const cancelRes = await fetch(`${SQUARE_API_BASE}/bookings/${squareBookingId}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({ idempotency_key: `cancel-${squareBookingId}`, booking_version: version }),
  });
  return cancelRes.ok;
}

/** 日本時間の日付・時刻(HH:MM) を、SquareのstartAtが要求するUTCのISO文字列に変換する */
export function jstToUtcIso(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, m) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

