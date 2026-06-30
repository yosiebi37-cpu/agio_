'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { yen, formatDateShort } from '@/lib/format';

export interface DailyRow {
  date: string;
  count: number;
  sales: number;
}

interface Props {
  month: string; // 'YYYY-MM'
  rows: DailyRow[];
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

export default function SalesClient({ month, rows }: Props) {
  const router = useRouter();
  const [highlightDay, setHighlightDay] = useState<string | null>(null);

  const total = useMemo(() => rows.reduce((s, r) => s + r.sales, 0), [rows]);
  const totalCount = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);
  const avgPerDay = rows.length > 0 ? Math.round(total / rows.length) : 0;
  const maxSales = useMemo(() => Math.max(...rows.map((r) => r.sales), 1), [rows]);

  const navigate = (delta: number) => {
    router.push(`/sales?month=${shiftMonth(month, delta)}`);
  };

  return (
    <div className="page-wrap">
      <div className="board-controls" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => navigate(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today" style={{ minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</div>
          <div className="cal-arrow" onClick={() => navigate(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="bc-summary" style={{ marginLeft: 'auto' }}>
          <div className="bc-sum-item">営業日<span className="bc-sum-val">{rows.length}日</span></div>
          <div className="bc-sum-item">来客数<span className="bc-sum-val">{totalCount}件</span></div>
          <div className="bc-sum-item">月次売上<span className="bc-sum-val" style={{ color: 'var(--green)', fontSize: 15 }}>{yen(total)}</span></div>
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* KPI cards */}
        <div className="fl-kpis">
          <div className="kpi">
            <div className="kpi-label">月間売上合計</div>
            <div className="kpi-val" style={{ fontFamily: "'Cormorant Garamond',serif" }}>{yen(total)}</div>
            <div className="kpi-sub">{monthLabel(month)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">営業日数</div>
            <div className="kpi-val">{rows.length}<span style={{ fontSize: 13, fontFamily: 'inherit', fontWeight: 400 }}> 日</span></div>
            <div className="kpi-sub">来客 {totalCount} 件</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">1日平均売上</div>
            <div className="kpi-val" style={{ fontFamily: "'Cormorant Garamond',serif" }}>{yen(avgPerDay)}</div>
            <div className="kpi-sub">営業日ベース</div>
          </div>
        </div>

        {/* Bar chart + table */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--ink-m)', letterSpacing: '0.05em' }}>
            日別売上
          </div>
          {rows.length === 0 ? (
            <div className="empty-row">この月の予約データがありません。</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--sand)' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-m)' }}>日付</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-m)' }}>件数</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-m)', width: '50%' }}>売上</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Math.round((r.sales / maxSales) * 100);
                  const isHL = highlightDay === r.date;
                  return (
                    <tr
                      key={r.date}
                      style={{ borderTop: '1px solid var(--border)', background: isHL ? 'var(--sand)' : undefined, cursor: 'pointer' }}
                      onMouseEnter={() => setHighlightDay(r.date)}
                      onMouseLeave={() => setHighlightDay(null)}
                    >
                      <td style={{ padding: '9px 16px', color: 'var(--ink)' }}>{formatDateShort(r.date)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--ink-m)' }}>{r.count}</td>
                      <td style={{ padding: '9px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                          </div>
                          <div style={{ minWidth: 90, textAlign: 'right', fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: 'var(--ink)' }}>
                            {yen(r.sales)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--sand)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--ink)' }}>合計</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{totalCount}</td>
                  <td style={{ padding: '10px 16px', fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 700, color: 'var(--green)', textAlign: 'right' }}>
                    {yen(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
