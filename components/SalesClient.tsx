'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { yen, formatMonthLong, formatDateTiny, toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

interface BookingRow {
  booking_date: string;
  staff_id: string;
  amount: number;
  status: string;
  customer_type: string;
}

interface RetailByProduct {
  name: string;
  amount: number;
}

interface Props {
  month: string;
  bookings: BookingRow[];
  staff: Staff[];
  retailTotal: number;
  retailByProduct: RetailByProduct[];
  commissionTotal: number;
}

export default function SalesClient({ month, bookings, staff, retailTotal, retailByProduct, commissionTotal }: Props) {
  const router = useRouter();

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    router.push(`/sales?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const stats = useMemo(() => {
    const visited = bookings.filter((b) => b.status === 'visited');
    const realized = visited.reduce((s, b) => s + (b.amount ?? 0), 0);
    const projected = bookings.reduce((s, b) => s + (b.amount ?? 0), 0);
    const avgTicket = visited.length ? Math.round(realized / visited.length) : 0;

    const byDayMap = new Map<string, { count: number; sales: number }>();
    for (const b of visited) {
      const cur = byDayMap.get(b.booking_date) ?? { count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += b.amount ?? 0;
      byDayMap.set(b.booking_date, cur);
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

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

    return { realized, projected, visitedCount: visited.length, avgTicket, byDay, byStaff };
  }, [bookings, staff]);

  return (
    <div className="page-wrap">
      <div className="fl-top">
        <div className="fl-top-title">売上</div>
        <div className="cal-nav-row" style={{ marginRight: 8 }}>
          <div className="cal-arrow" onClick={() => shiftMonth(-1)}><i className="ti ti-chevron-left"></i></div>
          <div style={{ fontSize: 14, color: 'var(--ink-l)', minWidth: 100, textAlign: 'center' }}>{formatMonthLong(month)}</div>
          <div className="cal-arrow" onClick={() => shiftMonth(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="view-tabs">
          <div className="view-tab active">月次</div>
          <Link href={`/sales?view=day&date=${toISODate(new Date())}`} className="view-tab">日計表</Link>
        </div>
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">施術売上</div><div className="kpi-val">{yen(stats.realized)}</div><div className="kpi-sub">来店済み {stats.visitedCount}件</div></div>
          <div className="kpi"><div className="kpi-label">店販売上</div><div className="kpi-val">{yen(retailTotal)}</div><div className="kpi-sub">{formatMonthLong(month)}</div></div>
          <div className="kpi"><div className="kpi-label">合計売上</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{yen(stats.realized + retailTotal)}</div><div className="kpi-sub">施術＋店販</div></div>
          <div className="kpi"><div className="kpi-label">客単価</div><div className="kpi-val">{yen(stats.avgTicket)}</div><div className="kpi-sub">来店済み平均</div></div>
        </div>
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">予約総額</div><div className="kpi-val">{yen(stats.projected)}</div><div className="kpi-sub">全ステータス合計</div></div>
          <div className="kpi"><div className="kpi-label">来店数</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{stats.visitedCount}件</div><div className="kpi-sub">{formatMonthLong(month)}</div></div>
          <div className="kpi"><div className="kpi-label">業務委託報酬</div><div className="kpi-val" style={{ color: 'var(--red)' }}>{yen(commissionTotal)}</div><div className="kpi-sub">今月のお支払い予定</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>日付</th><th>来店数</th><th>売上</th></tr></thead>
              <tbody>
                {stats.byDay.map((r) => (
                  <tr key={r.date}>
                    <td>{formatDateTiny(r.date)}</td>
                    <td>{r.count}件</td>
                    <td>{yen(r.sales)}</td>
                  </tr>
                ))}
                {stats.byDay.length === 0 && (
                  <tr><td colSpan={3}><div className="empty-row">この月の来店済み予約はまだありません。</div></td></tr>
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
                  <tr><td colSpan={3}><div className="empty-row">この月の来店済み予約はまだありません。</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tbl-wrap" style={{ marginTop: 16 }}>
          <table className="tbl">
            <thead><tr><th>店販 商品別売上</th><th>売上</th></tr></thead>
            <tbody>
              {retailByProduct.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{yen(r.amount)}</td>
                </tr>
              ))}
              {retailByProduct.length === 0 && (
                <tr><td colSpan={2}><div className="empty-row">この月の店販売上はまだありません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
