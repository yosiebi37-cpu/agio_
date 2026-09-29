import type { SupabaseClient } from '@supabase/supabase-js';
import { getSquareLocationId, createSquareCustomer, createSquareBooking, jstToUtcIso } from '@/lib/square';
import { hhmm, toMinutes } from '@/lib/format';

/**
 * agioで登録された予約（手入力・/book・/book/line経由）を、Square側にも登録する。
 * メニュー名・担当スタッフがSquare側と紐付いている場合のみ登録できる。
 * すでにsquare_booking_idが付いている予約（Square発の予約や登録済みの予約）は対象外。
 */
export async function syncBookingToSquare(sb: SupabaseClient, bookingId: string): Promise<void> {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) return;

  const { data: booking } = await sb
    .from('bookings')
    .select('id,customer_name,staff_id,booking_date,start_time,end_time,menu,square_booking_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || booking.square_booking_id) return;

  const [{ data: menuRow }, { data: staffRow }] = await Promise.all([
    sb.from('menu_items').select('square_service_variation_id').eq('name', booking.menu).maybeSingle(),
    sb.from('staff').select('square_team_member_id').eq('id', booking.staff_id).maybeSingle(),
  ]);
  const serviceVariationId = menuRow?.square_service_variation_id as string | null | undefined;
  const teamMemberId = staffRow?.square_team_member_id as string | null | undefined;
  if (!serviceVariationId || !teamMemberId) return;

  const locationId = await getSquareLocationId(accessToken);
  if (!locationId) return;
  const customerId = await createSquareCustomer(accessToken, booking.customer_name, `agio-customer-${booking.id}`);
  if (!customerId) return;

  const durationMinutes = toMinutes(booking.end_time) - toMinutes(booking.start_time);
  const squareBookingId = await createSquareBooking(accessToken, {
    locationId,
    customerId,
    teamMemberId,
    serviceVariationId,
    startAtIso: jstToUtcIso(booking.booking_date, hhmm(booking.start_time)),
    durationMinutes,
    idempotencyKey: `agio-square-${booking.id}`,
  });
  if (squareBookingId) {
    await sb.from('bookings').update({ square_booking_id: squareBookingId }).eq('id', booking.id);
  }
}
