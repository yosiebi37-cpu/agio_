// HotPepper Beauty（SALON BOARD）から届く予約通知メールの件名判定・本文解析

export type HotpepperEmailKind = 'booking' | 'cancel' | null;

/** 件名から「予約」か「キャンセル」かを判定する */
export function classifyHotpepperSubject(subject: string): HotpepperEmailKind {
  if (subject.includes('キャンセル連絡')) return 'cancel';
  if (subject.includes('予約連絡') || subject.includes('予約が入りました')) return 'booking';
  return null;
}

export interface ParsedHotpepperBooking {
  reservationId: string;
  customerName: string;
  furigana: string | null;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  stylistName: string | null;
  menuName: string;
  price: number;
  durationMinutes: number;
}

/** 本文から予約番号だけを取り出す（予約・キャンセル両方のメールで共通） */
export function parseReservationId(body: string): string | null {
  const m = body.match(/■予約番号\s*([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/** 予約連絡メールの本文を解析する。必須項目が見つからなければ null を返す */
export function parseHotpepperBookingEmail(body: string): ParsedHotpepperBooking | null {
  const reservationId = parseReservationId(body);
  if (!reservationId) return null;

  const dateMatch = body.match(/■来店日時\s*(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*(\d{1,2}):(\d{2})/);
  if (!dateMatch) return null;
  const [, y, mo, d, h, mi] = dateMatch;
  const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const startTime = `${h.padStart(2, '0')}:${mi}`;

  const nameMatch = body.match(/■氏名\s*([^\n（(]+)[（(]([^）)]*)[）)]/);
  const customerName = nameMatch ? nameMatch[1].trim() : 'HotPepper予約（要確認）';
  const furigana = nameMatch ? nameMatch[2].trim() : null;

  const stylistMatch = body.match(/■スタイリスト\s*([^\n]+)/);
  const stylistName = stylistMatch ? stylistMatch[1].trim() : null;

  const menuMatch = body.match(/■メニュー\s*([^\n（(]+)/);
  const menuName = menuMatch ? menuMatch[1].trim() : 'HotPepper予約';

  const priceMatch = body.match(/メニュー金額[：:]\s*([\d,]+)円/);
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0;

  const durationMatch = body.match(/施術時間目安[：:]\s*(?:(\d+)時間)?\s*(?:(\d+)分)?/);
  const hours = durationMatch?.[1] ? Number(durationMatch[1]) : 0;
  const mins = durationMatch?.[2] ? Number(durationMatch[2]) : 0;
  const durationMinutes = hours * 60 + mins || 60;

  return { reservationId, customerName, furigana, date, startTime, stylistName, menuName, price, durationMinutes };
}
