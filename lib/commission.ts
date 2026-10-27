// 業務委託スタッフの報酬区分
// - 本人顧客（commission_settings.existing_rate / 既定60%）:
//     顧客カルテで「業務委託の本人顧客」にそのスタッフが設定されているお客様を、そのスタッフ本人が担当した予約
// - 店舗客（commission_settings.new_rate / 既定50%）:
//     それ以外すべて（agioの新規・再来・フリー・再来指名、顧客未登録の予約）

export type CommissionKind = 'own' | 'shop';

/** bookings の select に追加する埋め込み（customers.own_client_staff_id を一緒に取得） */
export const BOOKING_OWNER_SELECT = 'customer:customers(own_client_staff_id)';

type OwnerEmbed = { own_client_staff_id: string | null } | { own_client_staff_id: string | null }[] | null | undefined;

export interface BookingForCommission {
  staff_id: string;
  customer?: OwnerEmbed;
}

function ownerOf(embed: OwnerEmbed): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) return embed[0]?.own_client_staff_id ?? null;
  return embed.own_client_staff_id ?? null;
}

export function commissionKindOf(b: BookingForCommission): CommissionKind {
  const owner = ownerOf(b.customer);
  return owner && owner === b.staff_id ? 'own' : 'shop';
}

export function isOwnClientBooking(b: BookingForCommission): boolean {
  return commissionKindOf(b) === 'own';
}
