'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import {
  OPEN_HOUR,
  HOUR_W,
  STAFF_COL_W,
  HOURS,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_TAG_CLASS,
  TYPE_LABEL,
  TYPE_TAG_CLASS,
} from '@/lib/constants';
import { hhmm, toMinutes, yenK, formatDateShort, toISODate } from '@/lib/format';
import EditBookingModal from './EditBookingModal';
import type { Staff, BookingWithStaff, RetailSale } from '@/lib/types';

function textOn(bg: string): string {
  const c = bg.replace('#', '');
  if (c.length < 6) return '#fff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#2D1A00' : '#fff';
}

interface Props {
  staff: Staff[];
  bookings: BookingWithStaff[];
  date: string;
  closedLabel?: string | null;
  capacityOverrides: { hour: number; minute: number; capacity: number }[];
  shifts: { staff_id: string; start_time: string; end_time: string }[];
  retailSales: RetailSale[];
}

// 30分単位で「残り受付可能数」を確認・調整できるよう、営業時間を30分刻みのコマに分割する
const HALF_SLOTS: { hour: number; minute: number }[] = HOURS.flatMap((h) => [
  { hour: h, minute: 0 },
  { hour: h, minute: 30 },
]);

export default function BoardClient({ staff, bookings, date, closedLabel, capacityOverrides, shifts, retailSales }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BookingWithStaff | null>(null);
  const [editing, setEditing] = useState<BookingWithStaff | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const todayISO = toISODate(new Date());
    if (todayISO === date) {
      const tick = () => {
        const d = new Date();
        setNowMin(d.getHours() * 60 + d.getMinutes());
      };
      tick();
      const t = setInterval(tick, 60000);
      return () => clearInterval(t);
    }
    setNowMin(null);
  }, [date]);

  // オンライン予約（LINE・HotPepper・Square）がボード表示中に入っても気づけるよう、定期的に最新の状態に更新する
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(t);
  }, [router]);

  const visibleStaff = staff.filter((s) => !hidden.has(s.id));

  const byStaff = useMemo(() => {
    const map = new Map<string, BookingWithStaff[]>();
    for (const b of bookings) {
      const arr = map.get(b.staff_id) ?? [];
      arr.push(b);
      map.set(b.staff_id, arr);
    }
    return map;
  }, [bookings]);

  const retailByBooking = useMemo(() => {
    const map = new Map<string, RetailSale[]>();
    for (const r of retailSales) {
      if (!r.booking_id) continue;
      const arr = map.get(r.booking_id) ?? [];
      arr.push(r);
      map.set(r.booking_id, arr);
    }
    return map;
  }, [retailSales]);

  // 「フリー」は担当未定の予約を仮に割り当てるためのダミー枠で、実際に施術できる人員ではないため、
  // 残り受付可能数の計算からは除く（含めると実際は満席でも1枠分の余裕があるように見えてしまう）
  const freeStaffIds = useMemo(() => new Set(staff.filter((s) => s.name === 'フリー').map((s) => s.id)), [staff]);

  const capacityByHalf = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of capacityOverrides) map.set(c.hour * 60 + c.minute, c.capacity);
    return map;
  }, [capacityOverrides]);

  // 手動設定が無い時間帯は、その30分に実際にシフトが入っているスタッフの人数を上限として自動計算する
  // （誰もシフトに入っていない時間は、受付可能数も0になる）
  const shiftCountByHalf = useMemo(() => {
    const map = new Map<number, number>();
    for (const { hour, minute } of HALF_SLOTS) {
      const hStart = hour * 60 + minute;
      const hEnd = hStart + 30;
      const workingIds = new Set(
        shifts
          .filter((sh) => !freeStaffIds.has(sh.staff_id) && toMinutes(sh.start_time) <= hStart && toMinutes(sh.end_time) >= hEnd)
          .map((sh) => sh.staff_id),
      );
      map.set(hStart, workingIds.size);
    }
    return map;
  }, [shifts, freeStaffIds]);

  const halfHourStats = useMemo(() => {
    return HALF_SLOTS.map(({ hour, minute }) => {
      const hStart = hour * 60 + minute;
      const hEnd = hStart + 30;
      const count = bookings.filter(
        (b) => toMinutes(b.start_time) < hEnd && toMinutes(b.end_time) > hStart,
      ).length;
      const capacity = capacityByHalf.get(hStart) ?? shiftCountByHalf.get(hStart) ?? 0;
      return { hour, minute, count, capacity, remaining: Math.max(capacity - count, 0) };
    });
  }, [bookings, capacityByHalf, shiftCountByHalf]);

  const adjustCapacity = async (hour: number, minute: number, delta: number) => {
    const stat = halfHourStats.find((hs) => hs.hour === hour && hs.minute === minute);
    if (!stat) return;
    const nextCapacity = Math.max(stat.count, stat.capacity + delta);
    const sb = getBrowserSupabase();
    const { error } = await sb.from('hourly_capacity').upsert(
      { capacity_date: date, hour, minute, capacity: nextCapacity },
      { onConflict: 'capacity_date,hour,minute' },
    );
    if (error) {
      alert('受付可能数の変更に失敗しました。データベースの更新（30分刻み対応）がまだの場合があります。管理者に確認してください。\n\n' + error.message);
      return;
    }
    router.refresh();
  };

  const summary = useMemo(() => {
    const visible = bookings.filter((b) => !hidden.has(b.staff_id));
    return {
      total: visible.length,
      visited: visible.filter((b) => b.status === 'visited').length,
      sales: visible.reduce((s, b) => s + (b.amount ?? 0), 0),
    };
  }, [bookings, hidden]);

  const toggleStaff = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    router.push(`/board?date=${toISODate(d)}`);
  };

  const goToday = () => {
    router.push(`/board?date=${toISODate(new Date())}`);
  };

  const markVisited = async (b: BookingWithStaff) => {
    setBusy(true);
    const sb = getBrowserSupabase();
    await sb.from('bookings').update({ status: 'visited' }).eq('id', b.id);
    if (b.customer_id) {
      await sb.from('treatment_records').upsert(
        {
          booking_id: b.id,
          customer_id: b.customer_id,
          staff_id: b.staff_id,
          performed_on: b.booking_date,
          menu: b.menu,
          amount: b.amount,
          note: b.note,
        },
        { onConflict: 'booking_id' },
      );
    }
    setBusy(false);
    setSelected(null);
    router.refresh();
  };

  const cancelBooking = async (b: BookingWithStaff) => {
    if (!window.confirm(`${b.customer_name} 様の予約をキャンセル（削除）しますか？`)) return;
    setBusy(true);
    if (b.source === 'square' && b.square_booking_id) {
      const res = await fetch('/api/square-cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'キャンセルに失敗しました。');
        setBusy(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.squareCancelFailed) {
        alert('agioの予約は削除しました。ただしSquare側の予約は削除できなかったため、Square側は手動で確認してください。');
      }
    } else {
      const sb = getBrowserSupabase();
      await sb.from('bookings').delete().eq('id', b.id);
    }
    setBusy(false);
    setSelected(null);
    router.refresh();
  };

  const rowBodyWidth = `calc(var(--hourw) * ${HOURS.length})`;
  const nowLeft = nowMin !== null ? STAFF_COL_W + ((nowMin - OPEN_HOUR * 60) / 60) * HOUR_W : 0;
  const nowVisible =
    nowMin !== null && nowMin >= OPEN_HOUR * 60 && nowMin <= (OPEN_HOUR + HOURS.length) * 60;

  return (
    <div className="page-wrap">
      {/* controls */}
      <div className="board-controls">
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => shiftDate(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today">{formatDateShort(date)}</div>
          {closedLabel && <span className="tag" style={{ background: '#F6E4E2', color: 'var(--red)' }}>{closedLabel}</span>}
          <div className="cal-arrow" onClick={() => shiftDate(1)}><i className="ti ti-chevron-right"></i></div>
          <button className="btn-sm" onClick={goToday}>今日</button>
        </div>
        <div className="view-tabs">
          <div className="view-tab active">日</div>
          <Link href={`/board?view=week&date=${date}`} className="view-tab">週</Link>
          <Link href={`/board?view=month&date=${date}`} className="view-tab">月</Link>
        </div>
        <div className="bc-sep"></div>
        <div className="filter-staff">
          {staff.map((s) => {
            const on = !hidden.has(s.id);
            return (
              <div
                key={s.id}
                className={`staff-chip${on ? ' on' : ''}`}
                onClick={() => toggleStaff(s.id)}
                style={on ? { background: s.bg_color, color: s.fg_color, borderColor: 'transparent' } : { opacity: 0.5 }}
              >
                <div className="staff-dot" style={{ background: s.color }}></div>
                {s.name}
              </div>
            );
          })}
        </div>
        <div className="bc-summary">
          <div className="bc-sum-item">予約<span className="bc-sum-val">{summary.total}件</span></div>
          <div className="bc-sum-item">来店済<span className="bc-sum-val" style={{ color: 'var(--green)' }}>{summary.visited}</span></div>
          <div className="bc-sum-item">売上<span className="bc-sum-val">{yenK(summary.sales)}</span></div>
        </div>
      </div>

      {/* board */}
      <div className="board-scroll">
        <div className="board-grid">
          <div className="board-head-row">
            <div className="board-corner">時刻</div>
            {HOURS.map((h) => (
              <div className="time-col-head" key={h}>{h}:00</div>
            ))}
          </div>

          <div className="board-summary-row" style={{ top: 56 }}>
            <div className="board-summary-label">予約数</div>
            {halfHourStats.map((hs) => (
              <div
                className="summary-cell"
                key={`${hs.hour}-${hs.minute}`}
                style={{ width: 'calc(var(--hourw) / 2)', background: hs.minute === 30 ? 'rgba(245,240,232,0.4)' : undefined }}
              >
                {hs.count}
              </div>
            ))}
          </div>
          <div className="board-summary-row" style={{ top: 88 }}>
            <div className="board-summary-label">残り受付可能数</div>
            {halfHourStats.map((hs) => (
              <div
                className="summary-cell"
                key={`${hs.hour}-${hs.minute}`}
                style={{ width: 'calc(var(--hourw) / 2)', gap: 2, fontSize: 12, background: hs.minute === 30 ? 'rgba(245,240,232,0.4)' : undefined }}
              >
                <i
                  className="ti ti-minus"
                  style={{ fontSize: 11, color: 'var(--ink-l)', cursor: 'pointer', padding: 2 }}
                  onClick={() => adjustCapacity(hs.hour, hs.minute, -1)}
                ></i>
                <span style={{ minWidth: 14, textAlign: 'center', ...(hs.remaining === 0 ? { color: 'var(--red)', fontWeight: 600 } : undefined) }}>
                  {hs.remaining}
                </span>
                <i
                  className="ti ti-plus"
                  style={{ fontSize: 11, color: 'var(--ink-l)', cursor: 'pointer', padding: 2 }}
                  onClick={() => adjustCapacity(hs.hour, hs.minute, 1)}
                ></i>
              </div>
            ))}
          </div>

          <div className="board-body">
            {visibleStaff.map((s) => {
              const list = byStaff.get(s.id) ?? [];
              return (
                <div className="staff-row" key={s.id}>
                  <div className="staff-row-head">
                    <div className="sh-avatar" style={{ background: s.bg_color, color: s.fg_color }}>{s.initials}</div>
                    <div>
                      <div className="sh-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {s.name}
                        {s.employment_type === 'contract' && (
                          <span className="tag tag-pend" style={{ fontSize: 11, padding: '1px 5px' }}>委託</span>
                        )}
                      </div>
                      <div className="sh-count">{list.length}件</div>
                    </div>
                  </div>
                  <div className="staff-row-body" style={{ width: rowBodyWidth }}>
                    {HOURS.map((h) => (
                      <div className="hour-cell-v" key={h}><div className="half-line-v"></div></div>
                    ))}
                    {list.map((b) => {
                      const bg = b.staff?.color ?? s.color;
                      const fg = textOn(bg);
                      const left = ((toMinutes(b.start_time) - OPEN_HOUR * 60) / 60) * HOUR_W;
                      const width = ((toMinutes(b.end_time) - toMinutes(b.start_time)) / 60) * HOUR_W;
                      const hasRetail = (retailByBooking.get(b.id) ?? []).length > 0;
                      return (
                        <div
                          key={b.id}
                          className="booking-block"
                          style={{ left, width, background: bg, color: fg }}
                          onClick={() => setSelected(b)}
                        >
                          <div className="bb-time">{hhmm(b.start_time)} — {hhmm(b.end_time)}</div>
                          <div className="bb-name">{b.customer_name}</div>
                          <div className="bb-menu">{b.menu}</div>
                          {hasRetail && (
                            <i className="ti ti-shopping-bag" title="店販あり" style={{ position: 'absolute', top: 5, left: 5, fontSize: 11 }}></i>
                          )}
                          <div className="bb-status" style={{ background: STATUS_DOT[b.status] }}></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {nowVisible && (
              <div className="now-line-v" style={{ left: nowLeft }}>
                <div className="now-badge">
                  NOW {String(Math.floor((nowMin as number) / 60)).padStart(2, '0')}:{String((nowMin as number) % 60).padStart(2, '0')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* drawer */}
      {selected && (
        <div className="drawer-bg open" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="drawer">
            <div className="drawer-head">
              <div className="drawer-title">{selected.customer_name}</div>
              <button className="drawer-close" onClick={() => setSelected(null)}><i className="ti ti-x"></i></button>
            </div>
            <div className="drawer-body">
              <div className="drawer-row">
                <div className="drawer-icon" style={{ background: 'var(--accent-l)', color: 'var(--accent)' }}><i className="ti ti-clock"></i></div>
                <div><div className="drawer-label">時間</div><div className="drawer-val">{hhmm(selected.start_time)} — {hhmm(selected.end_time)}</div></div>
              </div>
              <div className="drawer-row">
                <div className="drawer-icon" style={{ background: 'var(--gold-l)', color: 'var(--gold-d)' }}><i className="ti ti-scissors"></i></div>
                <div><div className="drawer-label">メニュー</div><div className="drawer-val">{selected.menu}</div></div>
              </div>
              {(retailByBooking.get(selected.id) ?? []).length > 0 && (
                <div className="drawer-row">
                  <div className="drawer-icon" style={{ background: 'var(--sand)', color: 'var(--ink-m)' }}><i className="ti ti-shopping-bag"></i></div>
                  <div>
                    <div className="drawer-label">店販</div>
                    <div className="drawer-val">
                      {(retailByBooking.get(selected.id) ?? []).map((r) => `${r.product_name}（¥${r.amount.toLocaleString('ja-JP')}）`).join('、')}
                    </div>
                  </div>
                </div>
              )}
              <div className="drawer-row">
                <div className="drawer-icon" style={{ background: 'var(--sand)', color: 'var(--ink-m)' }}><i className="ti ti-user"></i></div>
                <div><div className="drawer-label">担当スタイリスト</div><div className="drawer-val">{selected.staff?.name ?? '—'}</div></div>
              </div>
              <div className="drawer-row">
                <div className="drawer-icon" style={{ background: 'var(--sand)', color: 'var(--ink-m)' }}><i className="ti ti-tag"></i></div>
                <div>
                  <div className="drawer-label">ステータス / 区分</div>
                  <div className="drawer-val" style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <span className={`tag ${STATUS_TAG_CLASS[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                    <span className={`tag ${TYPE_TAG_CLASS[selected.customer_type]}`}>{TYPE_LABEL[selected.customer_type]}</span>
                  </div>
                </div>
              </div>
              <div className="drawer-row">
                <div className="drawer-icon" style={{ background: 'var(--accent-l)', color: 'var(--accent)' }}><i className="ti ti-currency-yen"></i></div>
                <div><div className="drawer-label">金額</div><div className="drawer-val" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22 }}>{'¥' + (selected.amount ?? 0).toLocaleString('ja-JP')}</div></div>
              </div>
              <div className="drawer-row" style={{ border: 'none' }}>
                <div className="drawer-icon" style={{ background: 'var(--sand)', color: 'var(--ink-m)' }}><i className="ti ti-note"></i></div>
                <div><div className="drawer-label">メモ</div><div className="drawer-val">{selected.note || '—'}</div></div>
              </div>
            </div>
            <div className="drawer-actions">
              <button
                className="daction daction-karte"
                disabled={!selected.customer_id}
                title={selected.customer_id ? '' : 'カルテ未登録'}
                style={!selected.customer_id ? { opacity: 0.5, cursor: 'default' } : undefined}
                onClick={() => selected.customer_id && router.push(`/karte/${selected.customer_id}?date=${selected.booking_date}`)}
              >
                <i className="ti ti-id-badge"></i>カルテを開く
              </button>
              <button className="daction" style={{ background: 'var(--sand)', color: 'var(--ink)' }} disabled={busy} onClick={() => setEditing(selected)}><i className="ti ti-edit"></i>編集</button>
              <button className="daction daction-done" disabled={busy} onClick={() => markVisited(selected)}><i className="ti ti-check"></i>来店済みに</button>
              <button className="daction daction-cancel" disabled={busy} onClick={() => cancelBooking(selected)}><i className="ti ti-x"></i>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditBookingModal
          open={!!editing}
          onClose={() => { setEditing(null); setSelected(null); }}
          booking={editing}
          staff={staff}
        />
      )}
    </div>
  );
}
