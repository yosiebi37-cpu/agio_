'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toISODate, formatMonthLong, yenK } from '@/lib/format';

interface BookingRow {
  booking_date: string;
  amount: number;
  status: string;
}

interface Props {
  bookings: BookingRow[];
  date: string;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function BoardMonthView({ bookings, date }: Props) {
  const router = useRouter();
  const [y, m] = date.split('-').map(Number);
  const month = `${y}-${String(m).padStart(2, '0')}`;
  const today = toISODate(new Date());

  const cellData = useMemo(() => {
    const map = new Map<string, { count: number; sales: number }>();
    for (const b of bookings) {
      const cur = map.get(b.booking_date) ?? { count: 0, sales: 0 };
      cur.count += 1;
      if (b.status === 'visited') cur.sales += b.amount ?? 0;
      map.set(b.booking_date, cur);
    }
    return map;
  }, [bookings]);

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startWeekday = firstOfMonth.getDay();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(y, m - 1, d)));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [y, m]);

  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    router.push(`/board?view=month&date=${toISODate(d)}`);
  };

  return (
    <div className="page-wrap">
      <div className="board-controls">
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => shiftMonth(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today">{formatMonthLong(month)}</div>
          <div className="cal-arrow" onClick={() => shiftMonth(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="view-tabs">
          <Link href={`/board?date=${date}`} className="view-tab">日</Link>
          <Link href={`/board?view=week&date=${date}`} className="view-tab">週</Link>
          <div className="view-tab active">月</div>
        </div>
      </div>

      <div className="month-wrap">
        <div className="month-weekday-row">
          {WEEKDAY.map((w) => (
            <div className="month-weekday" key={w}>{w}</div>
          ))}
        </div>
        {weeks.map((row, i) => (
          <div className="month-week-row" key={i}>
            {row.map((d, j) => {
              const cell = d ? cellData.get(d) : undefined;
              return (
                <Link
                  href={d ? `/board?date=${d}` : '#'}
                  key={j}
                  className={`month-cell${d ? '' : ' empty'}${d === today ? ' today' : ''}`}
                  aria-disabled={!d}
                  onClick={(e) => { if (!d) e.preventDefault(); }}
                >
                  {d && (
                    <>
                      <div className="month-cell-day">{Number(d.slice(-2))}</div>
                      {cell && (
                        <div className="month-cell-stats">
                          <div className="month-cell-count">{cell.count}件</div>
                          {cell.sales > 0 && <div className="month-cell-sales">{yenK(cell.sales)}</div>}
                        </div>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
