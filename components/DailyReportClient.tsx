'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { yen, hhmm, formatDateLong, addDays, toISODate } from '@/lib/format';
import { STATUS_LABEL, STATUS_TAG_CLASS, TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import type { Staff, BookingStatus, CustomerType } from '@/lib/types';

interface BookingRow {
  id: string;
  customer_name: string;
  staff_id: string;
  start_time: string;
  menu: string;
  amount: number;
  status: string;
  customer_type: string;
}

interface Props {
  date: string;
  bookings: BookingRow[];
  staff: Staff[];
}

export default function DailyReportClient({ date, bookings, staff }: Props) {
  const router = useRouter();
  const today = toISODate(new Date());

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const shiftDay = (delta: number) => {
    router.push(`/sales?view=day&date=${addDays(date, delta)}`);
  };

  const stats = useMemo(() => {
    const visited = bookings.filter((b) => b.status === 'visited');
    const realized = visited.reduce((s, b) => s + (b.amount ?? 0), 0);
    const avgTicket = visited.length ? Math.round(realized / visited.length) : 0;

    const byType = { new: { count: 0, sales: 0 }, existing: { count: 0, sales: 0 } };
    for (const b of visited) {
      const key = b.customer_type === 'new' ? 'new' : 'existing';
      byType[key].count += 1;
      byType[key].sales += b.amount ?? 0;
    }

    const byStaffMap = new Map<string, { count: number; sales: number }>();
    for (const b of visited) {
      const cur = byStaffMap.get(b.staff_id) ?? { count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += b.amount ?? 0;
      byStaffMap.set(b.staff_id, cur);
    }
    const byStaff = staff
      .map((s) => ({ staff: s, ...(byStaffMap.get(s.id) ?? { count: 0, sales: 0 }) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.sales - a.sales);

    return { realized, visitedCount: visited.length, avgTicket, byType, byStaff };
  }, [bookings, staff]);

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings],
  );

  return (
    <div className="page-wrap">
      <div className="fl-top">
        <div className="fl-top-title">日計表</div>
        <div className="cal-nav-row" style={{ marginRight: 8 }}>
          <div className="cal-arrow" onClick={() => shiftDay(-1)}><i className="ti ti-chevron-left"></i></div>
          <div style={{ fontSize: 14, color: 'var(--ink-l)', minWidth: 160, textAlign: 'center' }}>{formatDateLong(date)}</div>
          <div className="cal-arrow" onClick={() => shiftDay(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="view-tabs">
          <Link href={`/sales?month=${date.slice(0, 7)}`} className="view-tab">月次</Link>
          <div className="view-tab active">日計表</div>
        </div>
        {date !== today && (
          <div className="cal-today" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => router.push(`/sales?view=day&date=${today}`)}>
            今日に戻る
          </div>
        )}
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">確定売上</div><div className="kpi-val">{yen(stats.realized)}</div><div className="kpi-sub">来店済み {stats.visitedCount}件</div></div>
          <div className="kpi"><div className="kpi-label">客単価</div><div className="kpi-val">{yen(stats.avgTicket)}</div><div className="kpi-sub">来店済み平均</div></div>
          <div className="kpi"><div className="kpi-label">新規客</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{stats.byType.new.count}件</div><div className="kpi-sub">{yen(stats.byType.new.sales)}</div></div>
          <div className="kpi"><div className="kpi-label">既存客</div><div className="kpi-val">{stats.byType.existing.count}件</div><div className="kpi-sub">{yen(stats.byType.existing.sales)}</div></div>
        </div>

        <div className="tbl-wrap" style={{ marginBottom: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>時間</th>
                <th>お客様名</th>
                <th>担当</th>
                <th>メニュー</th>
                <th>区分</th>
                <th>ステータス</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {sortedBookings.map((b) => {
                const s = staffMap.get(b.staff_id);
                return (
                  <tr key={b.id}>
                    <td>{hhmm(b.start_time)}</td>
                    <td>{b.customer_name}</td>
                    <td>
                      {s && (
                        <div className="name-link" style={{ color: 'var(--ink)', cursor: 'default' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.bg_color, color: s.fg_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                            {s.initials}
                          </div>
                          {s.name}
                        </div>
                      )}
                    </td>
                    <td>{b.menu}</td>
                    <td><span className={`tag ${TYPE_TAG_CLASS[b.customer_type as CustomerType]}`}>{TYPE_LABEL[b.customer_type as CustomerType]}</span></td>
                    <td><span className={`tag ${STATUS_TAG_CLASS[b.status as BookingStatus]}`}>{STATUS_LABEL[b.status as BookingStatus]}</span></td>
                    <td>{yen(b.amount)}</td>
                  </tr>
                );
              })}
              {sortedBookings.length === 0 && (
                <tr><td colSpan={7}><div className="empty-row">この日の予約はまだありません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>スタッフ</th><th>来店数</th><th>売上</th></tr></thead>
            <tbody>
              {stats.byStaff.map((r) => (
                <tr key={r.staff.id}>
                  <td>
                    <div className="name-link" style={{ color: 'var(--ink)', cursor: 'default' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: r.staff.bg_color, color: r.staff.fg_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                        {r.staff.initials}
                      </div>
                      {r.staff.name}
                    </div>
                  </td>
                  <td>{r.count}件</td>
                  <td>{yen(r.sales)}</td>
                </tr>
              ))}
              {stats.byStaff.length === 0 && (
                <tr><td colSpan={3}><div className="empty-row">この日の来店済み予約はまだありません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
