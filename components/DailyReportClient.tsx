'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { yen, hhmm, formatDateLong, addDays, toISODate } from '@/lib/format';
import { STATUS_LABEL, STATUS_TAG_CLASS, TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import { getBrowserSupabase } from '@/lib/supabase/client';
import NewRetailSaleModal from './NewRetailSaleModal';
import type { Staff, BookingStatus, CustomerType, RetailSale } from '@/lib/types';

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

interface ManualSaleRow {
  staff_id: string;
  existing_amount: number;
  new_amount: number;
}

interface Props {
  date: string;
  bookings: BookingRow[];
  staff: Staff[];
  retailSales: RetailSale[];
  manualSales: ManualSaleRow[];
}

export default function DailyReportClient({ date, bookings, staff, retailSales, manualSales }: Props) {
  const router = useRouter();
  const today = toISODate(new Date());
  const [retailModalOpen, setRetailModalOpen] = useState(false);
  const [localManual, setLocalManual] = useState<Map<string, { ex: number; nw: number }>>(
    () => new Map(manualSales.map((m) => [m.staff_id, { ex: m.existing_amount, nw: m.new_amount }])),
  );

  useEffect(() => {
    setLocalManual(new Map(manualSales.map((m) => [m.staff_id, { ex: m.existing_amount, nw: m.new_amount }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const retailTotal = useMemo(() => retailSales.reduce((s, r) => s + (r.amount ?? 0), 0), [retailSales]);

  const deleteRetailSale = async (id: string) => {
    const sb = getBrowserSupabase();
    await sb.from('retail_sales').delete().eq('id', id);
    router.refresh();
  };

  const shiftDay = (delta: number) => {
    router.push(`/sales?view=day&date=${addDays(date, delta)}`);
  };

  const updateManual = (staffId: string, field: 'ex' | 'nw', value: number) => {
    setLocalManual((prev) => {
      const next = new Map(prev);
      const cur = next.get(staffId) ?? { ex: 0, nw: 0 };
      next.set(staffId, { ...cur, [field]: value });
      return next;
    });
  };

  const persistManual = async (staffId: string) => {
    const cur = localManual.get(staffId) ?? { ex: 0, nw: 0 };
    try {
      const sb = getBrowserSupabase();
      await sb.from('freelance_daily_sales').upsert(
        { staff_id: staffId, sale_date: date, existing_amount: cur.ex, new_amount: cur.nw },
        { onConflict: 'staff_id,sale_date' },
      );
      router.refresh();
    } catch {
      /* 保存に失敗しても画面の入力値は維持する */
    }
  };

  const stats = useMemo(() => {
    const visited = bookings.filter((b) => b.status === 'visited');
    const bookingRealized = visited.reduce((s, b) => s + (b.amount ?? 0), 0);
    const manualTotal = Array.from(localManual.values()).reduce((s, m) => s + m.ex + m.nw, 0);
    const realized = bookingRealized + manualTotal;
    const avgTicket = visited.length ? Math.round(bookingRealized / visited.length) : 0;

    const byType = { new: { count: 0, sales: 0 }, existing: { count: 0, sales: 0 } };
    for (const b of visited) {
      const key = b.customer_type === 'new' ? 'new' : 'existing';
      byType[key].count += 1;
      byType[key].sales += b.amount ?? 0;
    }
    for (const m of localManual.values()) {
      byType.existing.sales += m.ex;
      byType.new.sales += m.nw;
    }

    const byStaffMap = new Map<string, { count: number; sales: number }>();
    for (const b of visited) {
      const cur = byStaffMap.get(b.staff_id) ?? { count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += b.amount ?? 0;
      byStaffMap.set(b.staff_id, cur);
    }
    const byStaff = staff
      .map((s) => {
        const manual = localManual.get(s.id) ?? { ex: 0, nw: 0 };
        const booking = byStaffMap.get(s.id) ?? { count: 0, sales: 0 };
        return { staff: s, count: booking.count, sales: booking.sales + manual.ex + manual.nw, manualEx: manual.ex, manualNw: manual.nw };
      })
      .sort((a, b) => b.sales - a.sales);

    return { realized, visitedCount: visited.length, avgTicket, byType, byStaff };
  }, [bookings, staff, localManual]);

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
        <button className="btn-new" style={{ marginLeft: date !== today ? undefined : 'auto' }} onClick={() => setRetailModalOpen(true)}>
          <i className="ti ti-plus"></i>店販を追加
        </button>
        {date !== today && (
          <div className="cal-today" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={() => router.push(`/sales?view=day&date=${today}`)}>
            今日に戻る
          </div>
        )}
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">施術売上</div><div className="kpi-val">{yen(stats.realized)}</div><div className="kpi-sub">来店済み {stats.visitedCount}件</div></div>
          <div className="kpi"><div className="kpi-label">店販売上</div><div className="kpi-val">{yen(retailTotal)}</div><div className="kpi-sub">{retailSales.length}件</div></div>
          <div className="kpi"><div className="kpi-label">合計売上</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{yen(stats.realized + retailTotal)}</div><div className="kpi-sub">施術＋店販</div></div>
          <div className="kpi"><div className="kpi-label">客単価</div><div className="kpi-val">{yen(stats.avgTicket)}</div><div className="kpi-sub">来店済み平均</div></div>
        </div>
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">新規客</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{stats.byType.new.count}件</div><div className="kpi-sub">{yen(stats.byType.new.sales)}</div></div>
          <div className="kpi"><div className="kpi-label">既存客</div><div className="kpi-val">{stats.byType.existing.count}件</div><div className="kpi-sub">{yen(stats.byType.existing.sales)}</div></div>
        </div>

        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>店販</div>
        <div className="tbl-wrap" style={{ marginBottom: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>商品名</th>
                <th>担当</th>
                <th>金額</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {retailSales.map((r) => {
                const s = r.staff_id ? staffMap.get(r.staff_id) : undefined;
                return (
                  <tr key={r.id}>
                    <td>{r.product_name}</td>
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
                    <td>{yen(r.amount)}</td>
                    <td>
                      <button className="btn-cancel" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--red)' }} onClick={() => deleteRetailSale(r.id)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
              {retailSales.length === 0 && (
                <tr><td colSpan={4}><div className="empty-row">この日の店販はまだありません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>予約一覧</div>
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

        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>スタッフ別(施術)</div>
        <div style={{ fontSize: 12, color: 'var(--ink-l)', marginBottom: 8 }}>
          「既存客手入力」「新規客手入力」は直接入力できます。予約ボードの売上に上乗せして計算されます。
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>スタッフ</th><th>来店数</th><th>予約分売上</th><th>既存客手入力</th><th>新規客手入力</th><th>合計</th></tr></thead>
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
                  <td>{yen(r.sales - r.manualEx - r.manualNw)}</td>
                  <td>
                    <input
                      className="rate-input"
                      style={{ width: 90, textAlign: 'right' }}
                      type="number"
                      min={0}
                      value={r.manualEx}
                      onChange={(e) => updateManual(r.staff.id, 'ex', parseInt(e.target.value, 10) || 0)}
                      onBlur={() => persistManual(r.staff.id)}
                    />
                  </td>
                  <td>
                    <input
                      className="rate-input"
                      style={{ width: 90, textAlign: 'right' }}
                      type="number"
                      min={0}
                      value={r.manualNw}
                      onChange={(e) => updateManual(r.staff.id, 'nw', parseInt(e.target.value, 10) || 0)}
                      onBlur={() => persistManual(r.staff.id)}
                    />
                  </td>
                  <td>{yen(r.sales)}</td>
                </tr>
              ))}
              {stats.byStaff.length === 0 && (
                <tr><td colSpan={6}><div className="empty-row">スタッフが登録されていません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewRetailSaleModal open={retailModalOpen} onClose={() => setRetailModalOpen(false)} date={date} staff={staff} />
    </div>
  );
}
