'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import {
  OPEN_HOUR,
  ROW_PX,
  HOURS,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_TAG_CLASS,
  TYPE_LABEL,
  TYPE_TAG_CLASS,
} from '@/lib/constants';
import { hhmm, toMinutes, yenK, formatDateShort, toISODate } from '@/lib/format';
import type { Staff, BookingWithStaff } from '@/lib/types';

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
}

export default function BoardClient({ staff, bookings, date }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BookingWithStaff | null>(null);
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

  const markVisited = async (b: BookingWithStaff) => {
    setBusy(true);
    const sb = getBrowserSupabase();
    await sb.from('bookings').update({ status: 'visited' }).eq('id', b.id);
    setBusy(false);
    setSelected(null);
    router.refresh();
  };

  const cancelBooking = async (b: BookingWithStaff) => {
    if (!window.confirm(`${b.customer_name} 様の予約をキャンセル（削除）しますか？`)) return;
    setBusy(true);
    const sb = getBrowserSupabase();
    await sb.from('bookings').delete().eq('id', b.id);
    setBusy(false);
    setSelected(null);
    router.refresh();
  };

  const colBodyHeight = `calc(var(--row) * ${HOURS.length})`;
  const nowTop = nowMin !== null ? 52 + ((nowMin - OPEN_HOUR * 60) / 60) * ROW_PX : 0;
  const nowVisible =
    nowMin !== null && nowMin >= OPEN_HOUR * 60 && nowMin <= (OPEN_HOUR + HOURS.length) * 60;

  return (
    <div className="page-wrap">
      {/* controls */}
      <div className="board-controls">
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => shiftDate(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today">{formatDateShort(date)}</div>
          <div className="cal-arrow" onClick={() => shiftDate(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="view-tabs">
          <div className="view-tab active">日</div>
          <div className="view-tab">週</div>
          <div className="view-tab">月</div>
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
          <div className="board-left">
            <div className="board-left-head">時刻</div>
            {HOURS.map((h) => (
              <div className="time-slot" key={h}>{h}:00</div>
            ))}
          </div>

          <div className="board-cols">
            {visibleStaff.map((s) => {
              const list = byStaff.get(s.id) ?? [];
              return (
                <div className="staff-col" key={s.id}>
                  <div className="staff-head">
                    <div className="sh-avatar" style={{ background: s.bg_color, color: s.fg_color }}>{s.initials}</div>
                    <div>
                      <div className="sh-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {s.name}
                        {s.employment_type === 'contract' && (
                          <span className="tag tag-pend" style={{ fontSize: 9, padding: '1px 5px' }}>委託</span>
                        )}
                      </div>
                      <div className="sh-count">{list.length}件</div>
                    </div>
                  </div>
                  <div className="col-body" style={{ height: colBodyHeight }}>
                    {HOURS.map((h) => (
                      <div className="hour-cell" key={h}><div className="half-line"></div></div>
                    ))}
                    {list.map((b) => {
                      const bg = b.staff?.color ?? s.color;
                      const fg = textOn(bg);
                      const top = ((toMinutes(b.start_time) - OPEN_HOUR * 60) / 60) * ROW_PX;
                      const height = ((toMinutes(b.end_time) - toMinutes(b.start_time)) / 60) * ROW_PX;
                      return (
                        <div
                          key={b.id}
                          className="booking-block"
                          style={{ top, height, background: bg, color: fg }}
                          onClick={() => setSelected(b)}
                        >
                          <div className="bb-time">{hhmm(b.start_time)} — {hhmm(b.end_time)}</div>
                          <div className="bb-name">{b.customer_name}</div>
                          <div className="bb-menu">{b.menu}</div>
                          <div className="bb-status" style={{ background: STATUS_DOT[b.status] }}></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {nowVisible && (
          <div className="now-line" style={{ top: nowTop, left: 58 }}>
            <div style={{ position: 'absolute', left: 8, top: -8, fontSize: 9, background: 'var(--red)', color: '#fff', padding: '1px 5px', borderRadius: 3, fontWeight: 500 }}>
              NOW {String(Math.floor((nowMin as number) / 60)).padStart(2, '0')}:{String((nowMin as number) % 60).padStart(2, '0')}
            </div>
          </div>
        )}
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
                <div><div className="drawer-label">金額</div><div className="drawer-val" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20 }}>{'¥' + (selected.amount ?? 0).toLocaleString('ja-JP')}</div></div>
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
                onClick={() => selected.customer_id && router.push(`/karte/${selected.customer_id}`)}
              >
                <i className="ti ti-id-badge"></i>カルテを開く
              </button>
              <button className="daction daction-done" disabled={busy} onClick={() => markVisited(selected)}><i className="ti ti-check"></i>来店済みに</button>
              <button className="daction daction-cancel" disabled={busy} onClick={() => cancelBooking(selected)}><i className="ti ti-x"></i>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
