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

async function squareErrorText(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const errors = (data?.errors ?? []) as { code?: string; detail?: string; field?: string }[];
  const text = errors.map((e) => [e.code, e.field, e.detail].filter(Boolean).join(' ')).join(' / ');
  return `HTTP ${res.status}${text ? `: ${text}` : ''}`;
}

export async function createSquareCustomerDetailed(
  accessToken: string,
  name: string,
  idempotencyKey: string,
): Promise<{ id: string | null; error: string | null }> {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // 日本の名前は「姓 名」の順なので、1つ目を姓（family_name）、残りを名（given_name）にする
  const familyName = parts[0] ?? name;
  const givenName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  const res = await fetch(`${SQUARE_API_BASE}/customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({ idempotency_key: idempotencyKey, family_name: familyName, given_name: givenName }),
  });
  if (!res.ok) return { id: null, error: `お客様の登録に失敗（${await squareErrorText(res)}）` };
  const data = await res.json();
  return { id: data.customer?.id ?? null, error: data.customer?.id ? null : 'お客様の登録結果が空でした' };
}

export async function createSquareCustomer(
  accessToken: string,
  name: string,
  idempotencyKey: string,
): Promise<string | null> {
  return (await createSquareCustomerDetailed(accessToken, name, idempotencyKey)).id;
}

/** Squareのメニュー（サービス）の現在のバージョン番号を取得する。予約作成時に必要 */
async function getServiceVariationVersion(accessToken: string, serviceVariationId: string): Promise<number | null> {
  const res = await fetch(`${SQUARE_API_BASE}/catalog/object/${serviceVariationId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const version = data.object?.version;
  return typeof version === 'number' ? version : null;
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

export async function createSquareBookingDetailed(
  accessToken: string,
  params: CreateSquareBookingParams,
): Promise<{ id: string | null; error: string | null }> {
  // Squareは予約作成時にメニューの「現在のバージョン番号」を求めるため、毎回取得する
  // （以前は 1 を固定で送っていたため、Square側で断られていた）
  const version = await getServiceVariationVersion(accessToken, params.serviceVariationId);
  if (version == null) {
    return { id: null, error: 'Squareのメニューが見つかりません（設定画面のSquare IDを確認してください）' };
  }
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
            service_variation_version: version,
            duration_minutes: params.durationMinutes,
          },
        ],
      },
    }),
  });
  if (!res.ok) return { id: null, error: `予約の登録に失敗（${await squareErrorText(res)}）` };
  const data = await res.json();
  return { id: data.booking?.id ?? null, error: data.booking?.id ? null : '予約の登録結果が空でした' };
}

export async function createSquareBooking(
  accessToken: string,
  params: CreateSquareBookingParams,
): Promise<string | null> {
  return (await createSquareBookingDetailed(accessToken, params)).id;
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

