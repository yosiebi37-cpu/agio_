'use client';

import { useMemo, useState } from 'react';
import { yen, formatMonthLong } from '@/lib/format';
import type { MonthlyCustomerRow, MonthlyRetailRow, RepeatRow, AgeBracketRow, NewCustomerNameRow } from '@/lib/analytics';

interface Props {
  monthlyCustomers: MonthlyCustomerRow[];
  monthlyRetail: MonthlyRetailRow[];
  repeatRates: RepeatRow[];
  ageBrackets: AgeBracketRow[];
  newCustomerNames: NewCustomerNameRow[];
}

interface MergedRow {
  month: string;
  newCount: number;
  existingCount: number;
  treatmentSales: number;
  retailSales: number;
  repeatRate: number | null;
}

const NEW_COLOR = 'var(--accent)';
const EXISTING_COLOR = 'var(--gold)';
const TREATMENT_COLOR = 'var(--accent)';
const RETAIL_COLOR = 'var(--green)';

function GroupedBarChart({
  rows,
  seriesA,
  seriesB,
  labelA,
  colorA,
  colorB,
  labelB,
  formatValue,
}: {
  rows: MergedRow[];
  seriesA: (r: MergedRow) => number;
  seriesB: (r: MergedRow) => number;
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  formatValue: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 220;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(seriesA(r), seriesB(r))));
  const groupW = rows.length ? plotW / rows.length : plotW;
  const barW = Math.min(28, groupW * 0.32);
  const gap = 3;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + plotH * (1 - f)}
            y2={padTop + plotH * (1 - f)}
            stroke="var(--sand-d)"
            strokeWidth={1}
          />
        ))}
        {rows.map((r, i) => {
          const gx = padLeft + groupW * i + groupW / 2;
          const va = seriesA(r);
          const vb = seriesB(r);
          const ha = maxVal > 0 ? (va / maxVal) * plotH : 0;
          const hb = maxVal > 0 ? (vb / maxVal) * plotH : 0;
          const yBase = padTop + plotH;
          return (
            <g
              key={r.month}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              style={{ cursor: 'pointer' }}
            >
              <rect x={gx - gap / 2 - barW} y={yBase - ha} width={barW} height={Math.max(ha, 1)} rx={3} fill={colorA} opacity={hover === null || hover === i ? 1 : 0.35} />
              <rect x={gx + gap / 2} y={yBase - hb} width={barW} height={Math.max(hb, 1)} rx={3} fill={colorB} opacity={hover === null || hover === i ? 1 : 0.35} />
              <rect x={gx - groupW / 2} y={padTop} width={groupW} height={plotH} fill="transparent" />
              <text x={gx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--ink-l)">
                {r.month.slice(5)}月
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover] && (
        <div
          style={{
            position: 'absolute', top: 4, right: 4, background: 'var(--ink)', color: '#fff',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, pointerEvents: 'none', minWidth: 120,
          }}
        >
          <div style={{ opacity: 0.7, marginBottom: 4 }}>{formatMonthLong(rows[hover].month)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: colorA, flexShrink: 0 }}></span>{labelA}: {formatValue(seriesA(rows[hover]))}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: colorB, flexShrink: 0 }}></span>{labelB}: {formatValue(seriesB(rows[hover]))}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--ink-m)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: colorA, display: 'inline-block' }}></span>{labelA}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: colorB, display: 'inline-block' }}></span>{labelB}</div>
      </div>
    </div>
  );
}

// 単一シリーズなので凡例は不要。カテゴリが少ないため各バーに直接人数を表示する
function AgeBracketChart({ rows }: { rows: AgeBracketRow[] }) {
  const width = 640;
  const height = 180;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 20;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const maxVal = Math.max(1, ...rows.map((r) => r.count));
  const groupW = rows.length ? plotW / rows.length : plotW;
  const barW = Math.min(36, groupW * 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={padLeft} x2={width - padRight} y1={padTop + plotH * (1 - f)} y2={padTop + plotH * (1 - f)} stroke="var(--sand-d)" strokeWidth={1} />
      ))}
      {rows.map((r, i) => {
        const gx = padLeft + groupW * i + groupW / 2;
        const h = maxVal > 0 ? (r.count / maxVal) * plotH : 0;
        const yBase = padTop + plotH;
        return (
          <g key={r.bracket}>
            <rect x={gx - barW / 2} y={yBase - h} width={barW} height={Math.max(h, 1)} rx={4} fill="var(--accent)" />
            <text x={gx} y={yBase - h - 6} textAnchor="middle" fontSize={11} fill="var(--ink-m)">{r.count > 0 ? r.count : ''}</text>
            <text x={gx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--ink-l)">{r.bracket}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function AnalyticsClient({ monthlyCustomers, monthlyRetail, repeatRates, ageBrackets, newCustomerNames }: Props) {
  const rows = useMemo<MergedRow[]>(() => {
    const months = new Set<string>();
    monthlyCustomers.forEach((r) => months.add(r.month));
    monthlyRetail.forEach((r) => months.add(r.month));
    repeatRates.forEach((r) => months.add(r.month));
    const custMap = new Map(monthlyCustomers.map((r) => [r.month, r]));
    const retailMap = new Map(monthlyRetail.map((r) => [r.month, r]));
    const repeatMap = new Map(repeatRates.map((r) => [r.month, r]));
    return Array.from(months)
      .sort()
      .map((month) => ({
        month,
        newCount: custMap.get(month)?.newCount ?? 0,
        existingCount: custMap.get(month)?.existingCount ?? 0,
        treatmentSales: custMap.get(month)?.treatmentSales ?? 0,
        retailSales: retailMap.get(month)?.retailSales ?? 0,
        repeatRate: repeatMap.get(month)?.repeatRate ?? null,
      }));
  }, [monthlyCustomers, monthlyRetail, repeatRates]);

  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const newDelta = latest && prev ? latest.newCount - prev.newCount : null;
  const totalSalesLatest = latest ? latest.treatmentSales + latest.retailSales : 0;
  const totalSalesPrev = prev ? prev.treatmentSales + prev.retailSales : 0;
  const salesDelta = latest && prev ? totalSalesLatest - totalSalesPrev : null;

  // 直近1〜2ヶ月はまだ再来店するための時間が経っていないため、参考値として別扱いにする
  const matureRepeatRows = rows.slice(0, Math.max(0, rows.length - 2)).filter((r) => r.repeatRate !== null);
  const avgRepeatRate = matureRepeatRows.length
    ? matureRepeatRows.reduce((s, r) => s + (r.repeatRate ?? 0), 0) / matureRepeatRows.length
    : null;

  const [nameMonth, setNameMonth] = useState<string>(() => newCustomerNames[newCustomerNames.length - 1]?.month ?? '');
  const selectedNames = newCustomerNames.find((r) => r.month === nameMonth)?.names ?? [];

  return (
    <div className="page-wrap">
      <div className="fl-top">
        <div className="fl-top-title">分析</div>
      </div>

      <div className="fl-body">
        {rows.length === 0 ? (
          <div className="empty-row">まだ集計できるデータがありません。予約が来店済みになると表示されます。</div>
        ) : (
          <>
            <div className="fl-kpis">
              <div className="kpi">
                <div className="kpi-label">今月の新規客数</div>
                <div className="kpi-val" style={{ color: 'var(--accent)' }}>{latest.newCount}人</div>
                <div className="kpi-sub">
                  {newDelta === null ? '先月分のデータなし' : newDelta === 0 ? '先月と同じ' : `先月比 ${newDelta > 0 ? '+' : ''}${newDelta}人`}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">今月の既存客来店数</div>
                <div className="kpi-val">{latest.existingCount}人</div>
                <div className="kpi-sub">{formatMonthLong(latest.month)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">今月の合計売上</div>
                <div className="kpi-val">{yen(totalSalesLatest)}</div>
                <div className="kpi-sub">
                  {salesDelta === null ? '先月分のデータなし' : salesDelta === 0 ? '先月と同じ' : `先月比 ${salesDelta > 0 ? '+' : ''}${yen(salesDelta)}`}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">リピート率（平均）</div>
                <div className="kpi-val" style={{ color: 'var(--accent)' }}>{avgRepeatRate === null ? '—' : `${Math.round(avgRepeatRate * 100)}%`}</div>
                <div className="kpi-sub">新規客がその後また来店した割合</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
              <div className="tbl-wrap" style={{ padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>新規客・既存客の来店人数（月次）</div>
                <GroupedBarChart
                  rows={rows}
                  seriesA={(r) => r.newCount}
                  seriesB={(r) => r.existingCount}
                  labelA="新規客"
                  labelB="既存客"
                  colorA={NEW_COLOR}
                  colorB={EXISTING_COLOR}
                  formatValue={(n) => `${n}人`}
                />
              </div>
              <div className="tbl-wrap" style={{ padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>施術売上・店販売上（月次）</div>
                <GroupedBarChart
                  rows={rows}
                  seriesA={(r) => r.treatmentSales}
                  seriesB={(r) => r.retailSales}
                  labelA="施術売上"
                  labelB="店販売上"
                  colorA={TREATMENT_COLOR}
                  colorB={RETAIL_COLOR}
                  formatValue={(n) => yen(n)}
                />
              </div>
            </div>

            <div className="tbl-wrap" style={{ padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>年齢層</div>
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginBottom: 6 }}>顧客管理に登録されているお客様（生まれ年が未登録の方は「不明」）</div>
              <AgeBracketChart rows={ageBrackets} />
            </div>

            <div className="tbl-wrap" style={{ marginTop: 16 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>月</th>
                    <th>新規客</th>
                    <th>既存客</th>
                    <th>新規比率</th>
                    <th>リピート率</th>
                    <th>施術売上</th>
                    <th>店販売上</th>
                    <th>合計売上</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((r) => {
                    const totalVisits = r.newCount + r.existingCount;
                    const newRatio = totalVisits > 0 ? Math.round((r.newCount / totalVisits) * 100) : null;
                    return (
                      <tr key={r.month}>
                        <td>{r.month}</td>
                        <td>{r.newCount}人</td>
                        <td>{r.existingCount}人</td>
                        <td>{newRatio === null ? '—' : `${newRatio}%`}</td>
                        <td>{r.repeatRate === null ? '—' : `${Math.round(r.repeatRate * 100)}%`}</td>
                        <td>{yen(r.treatmentSales)}</td>
                        <td>{yen(r.retailSales)}</td>
                        <td>{yen(r.treatmentSales + r.retailSales)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="tbl-wrap" style={{ padding: 16, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>新規のお客様一覧</div>
                <select className="f-select" style={{ width: 140 }} value={nameMonth} onChange={(e) => setNameMonth(e.target.value)}>
                  {[...newCustomerNames].reverse().map((r) => (
                    <option key={r.month} value={r.month}>{formatMonthLong(r.month)}</option>
                  ))}
                </select>
              </div>
              {selectedNames.length === 0 ? (
                <div className="empty-row">この月の新規客はいません。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedNames.map((name, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--sand)', fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-l)', minWidth: 24 }}>{i + 1}</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 12, lineHeight: 1.7 }}>
              ・「リピート率」は、その月に初めて来店した(施術記録がある)お客様のうち、その後もう一度来店した割合です。直近1〜2ヶ月はまだ再来店するための期間が短いため、低めに出ることがあります。<br />
              ・お客様情報と紐付いていない一部の予約(ホットペッパー・Square経由で自動登録されたものなど)は、リピート率の集計に含まれていません。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
