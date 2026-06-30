'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { yen, formatDateSlash } from '@/lib/format';

export interface SalesBooking {
  booking_date: string;
  start_time: string;
  customer_name: string;
  menu: string;
  staff_id: string;
  staff_name: string;
  customer_type: 'existing' | 'new';
  customer_id: string | null;
  amount: number;
  shop_amount: number;
  status: string;
}

interface Props {
  bookings: SalesBooking[];
  month: string; // 'YYYY-MM'
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${ym}-${dd}`;
  });
}

function toDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY[d.getDay()]}）`;
}

function typeLabel(b: SalesBooking) {
  if (b.customer_type === 'existing') return '既存';
  if (b.customer_id != null) return '新規';
  return 'フリー';
}

export default function SalesClient({ bookings, month }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'day' | 'daily' | 'staff'>('day');

  // 日計表用: 選択中の日付
  const days = useMemo(() => daysInMonth(month), [month]);
  const today = useMemo(() => {
    const t = new Date();
    const ym = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    return ym === month ? `${ym}-${String(t.getDate()).padStart(2, '0')}` : days[0];
  }, [month, days]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const activeDay = selectedDay || today;

  // 来店済み予約のみ集計
  const visited = useMemo(() => bookings.filter((b) => b.status === 'visited'), [bookings]);

  const kpi = useMemo(() => {
    const service = visited.reduce((s, b) => s + b.amount, 0);
    const shop    = visited.reduce((s, b) => s + b.shop_amount, 0);
    const exCount = visited.filter((b) => b.customer_type === 'existing').length;
    const nwCount = visited.filter((b) => b.customer_type === 'new' && b.customer_id != null).length;
    const frCount = visited.filter((b) => b.customer_type === 'new' && b.customer_id == null).length;
    return {
      total: service + shop, service, shop, count: visited.length,
      avgSpend: visited.length > 0 ? Math.round((service + shop) / visited.length) : 0,
      exCount, nwCount, frCount,
    };
  }, [visited]);

  // 日別集計
  const byDay = useMemo(() => {
    return days.map((d) => {
      const rows = visited.filter((b) => b.booking_date === d);
      const service = rows.reduce((s, b) => s + b.amount, 0);
      const shop    = rows.reduce((s, b) => s + b.shop_amount, 0);
      const date    = new Date(d + 'T00:00:00');
      return { date: d, label: String(date.getDate()), weekday: WEEKDAY[date.getDay()], service, shop, total: service + shop, count: rows.length };
    });
  }, [days, visited]);

  const maxDay = useMemo(() => Math.max(...byDay.map((d) => d.total), 1), [byDay]);

  // スタッフ別集計
  const byStaff = useMemo(() => {
    const map = new Map<string, { name: string; service: number; shop: number; count: number }>();
    for (const b of visited) {
      const cur = map.get(b.staff_id) ?? { name: b.staff_name, service: 0, shop: 0, count: 0 };
      cur.service += b.amount;
      cur.shop    += b.shop_amount;
      cur.count   += 1;
      map.set(b.staff_id, cur);
    }
    return [...map.values()].sort((a, b) => (b.service + b.shop) - (a.service + a.shop));
  }, [visited]);

  // 日計表: 選択日の全予約（status問わず表示、合計は来店済みのみ）
  const dailyAll = useMemo(() =>
    bookings.filter((b) => b.booking_date === activeDay)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings, activeDay]);
  const dailyVisited = useMemo(() => dailyAll.filter((b) => b.status === 'visited'), [dailyAll]);
  const dailyTotal = useMemo(() => ({
    service: dailyVisited.reduce((s, b) => s + b.amount, 0),
    shop:    dailyVisited.reduce((s, b) => s + b.shop_amount, 0),
    count:   dailyVisited.length,
  }), [dailyVisited]);

  // 日計表: スタッフ別小計
  const dailyByStaff = useMemo(() => {
    const map = new Map<string, { name: string; service: number; shop: number; count: number }>();
    for (const b of dailyVisited) {
      const cur = map.get(b.staff_id) ?? { name: b.staff_name, service: 0, shop: 0, count: 0 };
      cur.service += b.amount;
      cur.shop    += b.shop_amount;
      cur.count   += 1;
      map.set(b.staff_id, cur);
    }
    return [...map.values()];
  }, [dailyVisited]);

  // 日計表: 日付選択リスト（売上ある日 or 今日）
  const daysWithData = useMemo(() => {
    const set = new Set(bookings.map((b) => b.booking_date));
    return days.filter((d) => set.has(d) || d === today);
  }, [days, bookings, today]);

  const goMonth = (delta: number) => {
    setSelectedDay('');
    router.push(`/sales?month=${shiftMonth(month, delta)}`);
  };

  return (
    <div className="page-wrap">
      {/* ヘッダー */}
      <div className="sales-top">
        <div className="sales-title">売上レポート</div>
        <div className="cal-nav-row" style={{ marginLeft: 'auto' }}>
          <div className="cal-arrow" onClick={() => goMonth(-1)}><i className="ti ti-chevron-left"></i></div>
          <div style={{ fontSize: 13, fontWeight: 500, minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</div>
          <div className="cal-arrow" onClick={() => goMonth(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
      </div>

      <div className="sales-body">
        {/* KPI */}
        <div className="sales-kpis">
          <div className="skpi skpi-main">
            <div className="skpi-label">月間売上合計</div>
            <div className="skpi-val">{yen(kpi.total)}</div>
            <div className="skpi-sub">{kpi.count}件 来店</div>
          </div>
          <div className="skpi">
            <div className="skpi-label">施術売上</div>
            <div className="skpi-val">{yen(kpi.service)}</div>
            <div className="skpi-sub">客単価 {yen(kpi.avgSpend)}</div>
          </div>
          <div className="skpi">
            <div className="skpi-label">店販売上</div>
            <div className="skpi-val">{yen(kpi.shop)}</div>
            <div className="skpi-sub">60% バック対象</div>
          </div>
          <div className="skpi">
            <div className="skpi-label">客種別</div>
            <div className="skpi-type-row">
              <span className="skpi-type-dot" style={{ background: '#2C4A3E' }}></span>
              <span className="skpi-type-label">既存</span>
              <span className="skpi-type-val">{kpi.exCount}名</span>
            </div>
            <div className="skpi-type-row">
              <span className="skpi-type-dot" style={{ background: '#C9A84C' }}></span>
              <span className="skpi-type-label">新規</span>
              <span className="skpi-type-val">{kpi.nwCount}名</span>
            </div>
            <div className="skpi-type-row">
              <span className="skpi-type-dot" style={{ background: '#C9A84C', opacity: 0.5 }}></span>
              <span className="skpi-type-label">フリー</span>
              <span className="skpi-type-val">{kpi.frCount}名</span>
            </div>
          </div>
        </div>

        {/* タブ */}
        <div className="sales-tabs">
          <button className={`stab${tab === 'day' ? ' active' : ''}`} onClick={() => setTab('day')}>
            <i className="ti ti-chart-bar"></i>日別売上
          </button>
          <button className={`stab${tab === 'daily' ? ' active' : ''}`} onClick={() => setTab('daily')}>
            <i className="ti ti-clipboard-list"></i>日計表
          </button>
          <button className={`stab${tab === 'staff' ? ' active' : ''}`} onClick={() => setTab('staff')}>
            <i className="ti ti-users"></i>スタッフ別
          </button>
        </div>

        {/* 日別グラフ */}
        {tab === 'day' && (
          <div className="sales-card">
            <div className="sales-card-head">
              <div className="sales-card-title">日別売上 — {monthLabel(month)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-l)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span><span className="legend-dot" style={{ background: '#2C4A3E' }}></span>施術</span>
                <span><span className="legend-dot" style={{ background: '#7B5EA7' }}></span>店販</span>
              </div>
            </div>
            <div className="day-chart">
              {byDay.map((d) => (
                <div className="day-col" key={d.date} style={{ cursor: d.count > 0 ? 'pointer' : 'default' }}
                  onClick={() => { if (d.count > 0) { setSelectedDay(d.date); setTab('daily'); } }}>
                  <div className="day-bar-wrap">
                    {d.total > 0 && (
                      <>
                        <div className="day-bar-shop" style={{ height: `${(d.shop / maxDay) * 140}px` }} title={`店販 ${yen(d.shop)}`} />
                        <div className="day-bar-service" style={{ height: `${(d.service / maxDay) * 140}px` }} title={`施術 ${yen(d.service)}`} />
                      </>
                    )}
                  </div>
                  <div className={`day-label${['日', '土'].includes(d.weekday) ? ' weekend' : ''}`}>{d.label}</div>
                  <div className="day-weekday">{d.weekday}</div>
                  {d.count > 0 && <div className="day-count">{d.count}</div>}
                </div>
              ))}
            </div>
            <div className="sales-day-table">
              <div className="sdt-head">
                <span>日付</span><span>件数</span><span>施術</span><span>店販</span><span>合計</span>
              </div>
              {byDay.filter((d) => d.total > 0).map((d) => (
                <div className="sdt-row sdt-row-link" key={d.date}
                  onClick={() => { setSelectedDay(d.date); setTab('daily'); }}>
                  <span>{toDateLabel(d.date)}</span>
                  <span>{d.count}件</span>
                  <span>{yen(d.service)}</span>
                  <span>{yen(d.shop)}</span>
                  <span style={{ fontWeight: 600 }}>{yen(d.total)}</span>
                </div>
              ))}
              {byDay.every((d) => d.total === 0) && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-l)', fontSize: 13 }}>
                  この月の売上データはありません
                </div>
              )}
            </div>
          </div>
        )}

        {/* 日計表 */}
        {tab === 'daily' && (
          <div className="sales-card">
            <div className="sales-card-head">
              <div className="sales-card-title">日計表</div>
              <select
                className="sel"
                style={{ fontSize: 12, padding: '4px 8px' }}
                value={activeDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              >
                {daysWithData.map((d) => (
                  <option key={d} value={d}>{toDateLabel(d)}</option>
                ))}
              </select>
            </div>

            {/* 予約一覧 */}
            <div className="daily-table">
              <div className="daily-head">
                <span>時間</span>
                <span>お客様</span>
                <span>担当</span>
                <span>メニュー</span>
                <span>区分</span>
                <span>施術</span>
                <span>店販</span>
                <span>合計</span>
                <span>状態</span>
              </div>
              {dailyAll.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-l)', fontSize: 13 }}>
                  この日の予約はありません
                </div>
              )}
              {dailyAll.map((b, i) => {
                const rowTotal = b.amount + b.shop_amount;
                const isVisited = b.status === 'visited';
                return (
                  <div className={`daily-row${!isVisited ? ' daily-row-dim' : ''}`} key={i}>
                    <span className="daily-time">{b.start_time.slice(0, 5)}</span>
                    <span className="daily-name">{b.customer_name}</span>
                    <span className="daily-staff">{b.staff_name}</span>
                    <span className="daily-menu">{b.menu}</span>
                    <span>
                      <span className={`tag ${b.customer_type === 'existing' ? 'tag-ex' : 'tag-new'}`}>
                        {typeLabel(b)}
                      </span>
                    </span>
                    <span className="daily-amount">{isVisited ? yen(b.amount) : '—'}</span>
                    <span className="daily-amount">{isVisited && b.shop_amount > 0 ? yen(b.shop_amount) : '—'}</span>
                    <span className="daily-amount" style={{ fontWeight: isVisited ? 600 : 400 }}>
                      {isVisited ? yen(rowTotal) : '—'}
                    </span>
                    <span>
                      <span className={`tag ${b.status === 'visited' ? 'tag-ex' : b.status === 'confirmed' ? 'tag-ok' : 'tag-new'}`}>
                        {b.status === 'visited' ? '来店済' : b.status === 'confirmed' ? '確定' : '仮予約'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 合計行 */}
            {dailyVisited.length > 0 && (
              <>
                <div className="daily-subtotal">
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>来店済み合計</span>
                  <span>{dailyTotal.count}件</span>
                  <span>施術 {yen(dailyTotal.service)}</span>
                  {dailyTotal.shop > 0 && <span>店販 {yen(dailyTotal.shop)}</span>}
                  <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 15 }}>
                    合計 {yen(dailyTotal.service + dailyTotal.shop)}
                  </span>
                </div>

                {/* スタッフ別小計 */}
                {dailyByStaff.length > 1 && (
                  <div className="daily-staff-sub">
                    <div className="daily-staff-sub-title">スタッフ別</div>
                    {dailyByStaff.map((s, i) => (
                      <div className="daily-staff-sub-row" key={i}>
                        <span>{s.name}</span>
                        <span>{s.count}件</span>
                        <span>施術 {yen(s.service)}</span>
                        {s.shop > 0 && <span>店販 {yen(s.shop)}</span>}
                        <span style={{ fontWeight: 600 }}>{yen(s.service + s.shop)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* スタッフ別 */}
        {tab === 'staff' && (
          <div className="sales-card">
            <div className="sales-card-head">
              <div className="sales-card-title">スタッフ別売上 — {monthLabel(month)}</div>
            </div>
            {byStaff.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-l)', fontSize: 13 }}>
                この月の売上データはありません
              </div>
            )}
            {byStaff.map((s, i) => {
              const total = s.service + s.shop;
              const pct   = kpi.total > 0 ? Math.round((total / kpi.total) * 100) : 0;
              return (
                <div className="staff-sales-row" key={i}>
                  <div className="ssr-name">{s.name}</div>
                  <div className="ssr-bar-wrap">
                    <div className="ssr-bar" style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="ssr-detail">
                    <span className="ssr-count">{s.count}件</span>
                    <span className="ssr-service">施術 {yen(s.service)}</span>
                    {s.shop > 0 && <span className="ssr-shop">店販 {yen(s.shop)}</span>}
                    <span className="ssr-total">{yen(total)}</span>
                    <span className="ssr-pct">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
