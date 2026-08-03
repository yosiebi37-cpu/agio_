'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { yen, formatDateLong, toISODate } from '@/lib/format';

export interface FreelanceRow {
  id: string;
  name: string;
  initials: string;
  bg: string;
  fg: string;
  count: number;
  exSales: number;
  nwSales: number;
  retailSales: number;
}

interface Props {
  rows: FreelanceRow[];
  date: string;
  initialExRate: number;
  initialNwRate: number;
  initialRetailRate: number;
}

export default function FreelanceClient({ rows, date, initialExRate, initialNwRate, initialRetailRate }: Props) {
  const router = useRouter();
  const [rex, setRex] = useState(initialExRate);
  const [rnw, setRnw] = useState(initialNwRate);
  const [rret, setRret] = useState(initialRetailRate);

  const calc = useMemo(() => {
    const totalEx = rows.reduce((s, r) => s + r.exSales, 0);
    const totalNw = rows.reduce((s, r) => s + r.nwSales, 0);
    const totalRetail = rows.reduce((s, r) => s + r.retailSales, 0);
    const rewardEx = rows.reduce((s, r) => s + Math.round((r.exSales * rex) / 100), 0);
    const rewardNw = rows.reduce((s, r) => s + Math.round((r.nwSales * rnw) / 100), 0);
    const rewardRetail = rows.reduce((s, r) => s + Math.round((r.retailSales * rret) / 100), 0);
    return {
      totalEx,
      totalNw,
      totalRetail,
      totalSales: totalEx + totalNw + totalRetail,
      rewardEx,
      rewardNw,
      rewardRetail,
      totalReward: rewardEx + rewardNw + rewardRetail,
      count: rows.reduce((s, r) => s + r.count, 0),
    };
  }, [rows, rex, rnw, rret]);

  const persistRates = async (ex: number, nw: number, retail: number) => {
    try {
      const sb = getBrowserSupabase();
      await sb.from('commission_settings').upsert({ id: 1, existing_rate: ex, new_rate: nw, retail_rate: retail, updated_at: new Date().toISOString() });
    } catch {
      /* 設定の保存に失敗しても画面の計算は継続する */
    }
  };

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    router.push(`/freelance?date=${toISODate(d)}`);
  };

  const exportCsv = () => {
    const header = ['スタッフ', '件数', '既存客売上', '新規客売上', '店販売上', '合計売上', `既存報酬(${rex}%)`, `新規報酬(${rnw}%)`, `店販報酬(${rret}%)`, '報酬合計'];
    const lines = rows.map((r) => {
      const exR = Math.round((r.exSales * rex) / 100);
      const nwR = Math.round((r.nwSales * rnw) / 100);
      const retR = Math.round((r.retailSales * rret) / 100);
      return [r.name, r.count, r.exSales, r.nwSales, r.retailSales, r.exSales + r.nwSales + r.retailSales, exR, nwR, retR, exR + nwR + retR].join(',');
    });
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freelance_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-wrap">
      <div className="fl-top">
        <div className="fl-top-title">業務委託スタッフ 報酬計算</div>
        <div className="cal-nav-row" style={{ marginRight: 8 }}>
          <div className="cal-arrow" onClick={() => shiftDate(-1)}><i className="ti ti-chevron-left"></i></div>
          <div style={{ fontSize: 14, color: 'var(--ink-l)', minWidth: 150, textAlign: 'center' }}>{formatDateLong(date)}</div>
          <div className="cal-arrow" onClick={() => shiftDate(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div className="rate-box">
          <div className="rate-dot" style={{ background: 'var(--accent)' }}></div>
          <span className="rate-label">既存客</span>
          <input
            className="rate-input"
            type="number"
            value={rex}
            min={0}
            max={100}
            onChange={(e) => setRex(parseInt(e.target.value, 10) || 0)}
            onBlur={() => persistRates(rex, rnw, rret)}
          />
          <span className="rate-pct">%</span>
        </div>
        <div className="rate-box">
          <div className="rate-dot" style={{ background: 'var(--gold)' }}></div>
          <span className="rate-label">新規客（店舗）</span>
          <input
            className="rate-input"
            type="number"
            value={rnw}
            min={0}
            max={100}
            onChange={(e) => setRnw(parseInt(e.target.value, 10) || 0)}
            onBlur={() => persistRates(rex, rnw, rret)}
          />
          <span className="rate-pct">%</span>
        </div>
        <div className="rate-box">
          <div className="rate-dot" style={{ background: 'var(--ink-l)' }}></div>
          <span className="rate-label">店販</span>
          <input
            className="rate-input"
            type="number"
            value={rret}
            min={0}
            max={100}
            onChange={(e) => setRret(parseInt(e.target.value, 10) || 0)}
            onBlur={() => persistRates(rex, rnw, rret)}
          />
          <span className="rate-pct">%</span>
        </div>
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">委託売上合計</div><div className="kpi-val">{yen(calc.totalSales)}</div><div className="kpi-sub">{rows.length}名 / {calc.count}件</div></div>
          <div className="kpi"><div className="kpi-label">既存客売上</div><div className="kpi-val">{yen(calc.totalEx)}</div><div className="kpi-sub">@ {rex}%</div></div>
          <div className="kpi"><div className="kpi-label">新規客売上</div><div className="kpi-val">{yen(calc.totalNw)}</div><div className="kpi-sub">@ {rnw}%</div></div>
          <div className="kpi"><div className="kpi-label">店販売上</div><div className="kpi-val">{yen(calc.totalRetail)}</div><div className="kpi-sub">@ {rret}%</div></div>
        </div>
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">報酬合計</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{yen(calc.totalReward)}</div><div className="kpi-sub">お支払い予定</div></div>
        </div>

        <div className="fl-cards">
          {rows.map((r) => {
            const exR = Math.round((r.exSales * rex) / 100);
            const nwR = Math.round((r.nwSales * rnw) / 100);
            const retR = Math.round((r.retailSales * rret) / 100);
            return (
              <div className="fl-card" key={r.id}>
                <div className="flc-top">
                  <div className="flc-avatar" style={{ background: r.bg, color: r.fg }}>{r.initials}</div>
                  <div><div className="flc-name">{r.name}</div><div className="flc-role">業務委託 ・ {r.count}件</div></div>
                </div>
                <div className="flc-breakdown">
                  <div className="flc-row"><span className="flc-key"><div className="flc-dot" style={{ background: 'var(--accent)' }}></div>既存客売上</span><span className="flc-val">{yen(r.exSales)}</span></div>
                  <div className="flc-row"><span className="flc-key"><div className="flc-dot" style={{ background: 'var(--gold)' }}></div>新規客売上</span><span className="flc-val">{yen(r.nwSales)}</span></div>
                  <div className="flc-row"><span className="flc-key"><div className="flc-dot" style={{ background: 'var(--ink-l)' }}></div>店販売上</span><span className="flc-val">{yen(r.retailSales)}</span></div>
                  <div className="flc-row"><span className="flc-key">合計売上</span><span className="flc-val" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17 }}>{yen(r.exSales + r.nwSales + r.retailSales)}</span></div>
                  <div className="flc-row"><span className="flc-key">既存報酬({rex}%)</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(exR)}</span></div>
                  <div className="flc-row"><span className="flc-key">新規報酬({rnw}%)</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(nwR)}</span></div>
                  <div className="flc-row" style={{ border: 'none' }}><span className="flc-key">店販報酬({rret}%)</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(retR)}</span></div>
                </div>
                <div className="flc-reward"><span className="flc-reward-label">報酬合計</span><span className="flc-reward-val">{yen(exR + nwR + retR)}</span></div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="empty-row">業務委託スタッフの予約がありません。</div>}
        </div>

        <div className="fl-total-bar">
          <div className="ftb-item"><div className="ftb-label">売上合計</div><div className="ftb-val">{yen(calc.totalSales)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">既存客 報酬</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardEx)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">新規客 報酬</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardNw)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">店販 報酬</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardRetail)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">報酬総計</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.totalReward)}</div></div>
          <button className="btn-csv" onClick={exportCsv}><i className="ti ti-download"></i>CSVエクスポート</button>
        </div>
      </div>
    </div>
  );
}
