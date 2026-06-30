'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { yen, formatDateLong, toISODate } from '@/lib/format';

// agio 固定報酬率
const EX_RATE   = 60; // 既存客
const NW_RATE   = 50; // 新規客・フリー客
const SHOP_RATE = 60; // 店販

export interface FreelanceRow {
  id: string;
  name: string;
  initials: string;
  bg: string;
  fg: string;
  count: number;
  exSales: number;
  nwSales: number;
  frSales: number;   // フリー客（未登録新規）
  shopSales: number; // 店販売上
  avgSpend: number;
}

interface Props {
  rows: FreelanceRow[];
  date: string;
}

export default function FreelanceClient({ rows, date }: Props) {
  const router = useRouter();

  const calc = useMemo(() => {
    const totalEx   = rows.reduce((s, r) => s + r.exSales, 0);
    const totalNw   = rows.reduce((s, r) => s + r.nwSales, 0);
    const totalFr   = rows.reduce((s, r) => s + r.frSales, 0);
    const totalShop = rows.reduce((s, r) => s + r.shopSales, 0);
    const rewardEx   = rows.reduce((s, r) => s + Math.round((r.exSales * EX_RATE) / 100), 0);
    const rewardNw   = rows.reduce((s, r) => s + Math.round(((r.nwSales + r.frSales) * NW_RATE) / 100), 0);
    const rewardShop = rows.reduce((s, r) => s + Math.round((r.shopSales * SHOP_RATE) / 100), 0);
    return {
      totalEx,
      totalNw,
      totalFr,
      totalShop,
      totalSales: totalEx + totalNw + totalFr + totalShop,
      rewardEx,
      rewardNw,
      rewardShop,
      totalReward: rewardEx + rewardNw + rewardShop,
      count: rows.reduce((s, r) => s + r.count, 0),
    };
  }, [rows]);

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    router.push(`/freelance?date=${toISODate(d)}`);
  };

  const exportCsv = () => {
    const header = ['スタッフ', '件数', '既存客売上', '新規客売上', 'フリー客売上', '店販売上', '合計売上', `既存報酬(${EX_RATE}%)`, `新規・フリー報酬(${NW_RATE}%)`, `店販報酬(${SHOP_RATE}%)`, '報酬合計'];
    const lines = rows.map((r) => {
      const exR   = Math.round((r.exSales * EX_RATE) / 100);
      const nwR   = Math.round(((r.nwSales + r.frSales) * NW_RATE) / 100);
      const shopR = Math.round((r.shopSales * SHOP_RATE) / 100);
      return [r.name, r.count, r.exSales, r.nwSales, r.frSales, r.shopSales, r.exSales + r.nwSales + r.frSales + r.shopSales, exR, nwR, shopR, exR + nwR + shopR].join(',');
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
          <div style={{ fontSize: 12, color: 'var(--ink-l)', minWidth: 150, textAlign: 'center' }}>{formatDateLong(date)}</div>
          <div className="cal-arrow" onClick={() => shiftDate(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        {/* agio 固定レートバッジ */}
        <div className="rate-box" style={{ cursor: 'default' }}>
          <div className="rate-dot" style={{ background: '#2C4A3E' }}></div>
          <span className="rate-label">既存客</span>
          <span className="rate-badge">{EX_RATE}%</span>
        </div>
        <div className="rate-box" style={{ cursor: 'default' }}>
          <div className="rate-dot" style={{ background: '#C9A84C' }}></div>
          <span className="rate-label">新規・フリー客</span>
          <span className="rate-badge">{NW_RATE}%</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-l)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-bolt" style={{ fontSize: 12, color: 'var(--accent)' }}></i>売上登録で自動計算
        </div>
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi">
            <div className="kpi-label">委託売上合計</div>
            <div className="kpi-val">{yen(calc.totalSales)}</div>
            <div className="kpi-sub">{rows.length}名 / {calc.count}件</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">既存客売上</div>
            <div className="kpi-val">{yen(calc.totalEx)}</div>
            <div className="kpi-sub">報酬率 {EX_RATE}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">新規・フリー客売上</div>
            <div className="kpi-val">{yen(calc.totalNw + calc.totalFr)}</div>
            <div className="kpi-sub">報酬率 {NW_RATE}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">店販売上</div>
            <div className="kpi-val">{yen(calc.totalShop)}</div>
            <div className="kpi-sub">報酬率 {SHOP_RATE}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">報酬合計</div>
            <div className="kpi-val" style={{ color: 'var(--accent)' }}>{yen(calc.totalReward)}</div>
            <div className="kpi-sub">お支払い予定</div>
          </div>
        </div>

        <div className="fl-cards">
          {rows.map((r) => {
            const totalSales  = r.exSales + r.nwSales + r.frSales;
            const exR         = Math.round((r.exSales * EX_RATE) / 100);
            const nwR         = Math.round(((r.nwSales + r.frSales) * NW_RATE) / 100);
            const shopR       = Math.round((r.shopSales * SHOP_RATE) / 100);
            const totalReward = exR + nwR + shopR;
            return (
              <div className="fl-card" key={r.id}>
                <div className="flc-top">
                  <div className="flc-avatar" style={{ background: r.bg, color: r.fg }}>{r.initials}</div>
                  <div>
                    <div className="flc-name">{r.name}</div>
                    <div className="flc-role">業務委託 ・ {r.count}件</div>
                  </div>
                </div>

                <div className="flc-breakdown">
                  {/* 売上内訳 */}
                  <div className="flc-section-label">売上内訳</div>
                  <div className="flc-row">
                    <span className="flc-key">個人売上合計</span>
                    <span className="flc-val" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{yen(totalSales)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key"><div className="flc-dot" style={{ background: '#2C4A3E' }}></div>既存客</span>
                    <span className="flc-val">{yen(r.exSales)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key"><div className="flc-dot" style={{ background: '#C9A84C' }}></div>新規客</span>
                    <span className="flc-val">{yen(r.nwSales)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key"><div className="flc-dot" style={{ background: '#C9A84C', opacity: 0.5 }}></div>フリー客</span>
                    <span className="flc-val">{yen(r.frSales)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key"><div className="flc-dot" style={{ background: '#7B5EA7', opacity: 0.7 }}></div>店販売上</span>
                    <span className="flc-val">{yen(r.shopSales)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key">客単価</span>
                    <span className="flc-val">{r.count > 0 ? yen(Math.round(totalSales / r.count)) : '—'}</span>
                  </div>

                  {/* 報酬内訳（自動計算） */}
                  <div className="flc-section-label" style={{ marginTop: 6 }}>
                    報酬内訳
                    <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 400 }}>
                      <i className="ti ti-bolt"></i> 自動計算
                    </span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key">既存客報酬 <span className="flc-rate-tag">{EX_RATE}%</span></span>
                    <span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(exR)}</span>
                  </div>
                  <div className="flc-row">
                    <span className="flc-key">新規・フリー客報酬 <span className="flc-rate-tag">{NW_RATE}%</span></span>
                    <span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(nwR)}</span>
                  </div>
                  <div className="flc-row" style={{ border: 'none' }}>
                    <span className="flc-key">店販報酬 <span className="flc-rate-tag">{SHOP_RATE}%</span></span>
                    <span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(shopR)}</span>
                  </div>
                </div>

                <div className="flc-reward">
                  <span className="flc-reward-label">報酬合計</span>
                  <span className="flc-reward-val">{yen(totalReward)}</span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="empty-row">業務委託スタッフの予約がありません。</div>}
        </div>

        <div className="fl-total-bar">
          <div className="ftb-item"><div className="ftb-label">売上合計</div><div className="ftb-val">{yen(calc.totalSales)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">既存客 報酬({EX_RATE}%)</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardEx)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">新規・フリー 報酬({NW_RATE}%)</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardNw)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">店販 報酬({SHOP_RATE}%)</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.rewardShop)}</div></div>
          <div className="ftb-sep"></div>
          <div className="ftb-item"><div className="ftb-label">報酬総計</div><div className="ftb-val" style={{ color: 'var(--accent)' }}>{yen(calc.totalReward)}</div></div>
          <button className="btn-csv" onClick={exportCsv}><i className="ti ti-download"></i>CSVエクスポート</button>
        </div>
      </div>
    </div>
  );
}
