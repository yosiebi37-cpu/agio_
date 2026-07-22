'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addDays, formatDateTiny, yenK, toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

interface BookingRow {
  booking_date: string;
  staff_id: string;
  amount: number;
  status: string;
}

interface Props {
  staff: Staff[];
  bookings: BookingRow[];
  date: string;
  weekStart: string;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function BoardWeekView({ staff, bookings, date, weekStart }: Props) {
  const router = useRouter();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = toISODate(new Date());

  const cellData = useMemo(() => {
    const map = new Map<string, { count: number; sales: number }>();
    for (const b of bookings) {
      const key = `${b.staff_id}|${b.booking_date}`;
      const cur = map.get(key) ?? { count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += b.amount ?? 0;
      map.set(key, cur);
    }
    return map;
  }, [bookings]);

  const shiftWeek = (delta: number) => {
    const d = addDays(weekStart, delta * 7);
    router.push(`/board?view=week&date=${d}`);
  };

  return (
    <div className="page-wrap">
      <div className="board-controls">
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => shiftWeek(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today">{formatDateTiny(weekStart)} 〜 {formatDateTiny(addDays(weekStart, 6))}</div>
          <div className="cal-arrow" onClick={() => shiftWeek(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="view-tabs">
          <Link href={`/board?date=${date}`} className="view-tab">日</Link>
          <div className="view-tab active">週</div>
          <Link href={`/board?view=month&date=${date}`} className="view-tab">月</Link>
        </div>
      </div>

      <div className="board-scroll">
        <div className="board-grid">
          <div className="board-head-row">
            <div className="board-corner">スタッフ</div>
            {days.map((d) => (
              <Link href={`/board?date=${d}`} key={d} className="time-col-head" style={{ flexDirection: 'column', gap: 2, color: d === today ? 'var(--accent)' : undefined, fontWeight: d === today ? 600 : undefined }}>
                <span>{WEEKDAY[new Date(d + 'T00:00:00').getDay()]}</span>
                <span style={{ fontSize: 11 }}>{formatDateTiny(d).split('(')[0]}</span>
              </Link>
            ))}
          </div>

          <div className="board-body">
            {staff.map((s) => (
              <div className="staff-row" key={s.id}>
                <div className="staff-row-head">
                  <div className="sh-avatar" style={{ background: s.bg_color, color: s.fg_color }}>{s.initials}</div>
                  <div className="sh-name">{s.name}</div>
                </div>
                {days.map((d) => {
                  const cell = cellData.get(`${s.id}|${d}`);
                  return (
                    <Link href={`/board?date=${d}`} key={d} className="day-cell">
                      {cell ? (
                        <>
                          <div className="day-cell-count">{cell.count}件</div>
                          <div className="day-cell-sales">{yenK(cell.sales)}</div>
                        </>
                      ) : (
                        <div className="day-cell-empty">—</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
            {staff.length === 0 && (
              <div className="empty-row">スタッフが登録されていません。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
