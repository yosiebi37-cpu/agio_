'use client';

import { useRouter } from 'next/navigation';
import { yen, formatMonthLong } from '@/lib/format';
import type { EmploymentType } from '@/lib/types';

interface Props {
  staffName: string;
  employmentType: EmploymentType;
  month: string;
  visitCount: number;
  existingSales: number;
  newSales: number;
  retailSales: number;
  exRate: number;
  nwRate: number;
  retailRate: number;
}

export default function MyRewardClient({
  staffName,
  employmentType,
  month,
  visitCount,
  existingSales,
  newSales,
  retailSales,
  exRate,
  nwRate,
  retailRate,
}: Props) {
  const router = useRouter();
  const isContract = employmentType === 'contract';

  const totalSales = existingSales + newSales + retailSales;
  const exReward = Math.round((existingSales * exRate) / 100);
  const nwReward = Math.round((newSales * nwRate) / 100);
  const retailReward = Math.round((retailSales * retailRate) / 100);
  const totalReward = exReward + nwReward + retailReward;

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    router.push(`/my-reward?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="page-wrap">
      <div className="fl-top">
        <div className="fl-top-title">{staffName} さんの実績</div>
        <div className="cal-nav-row" style={{ marginRight: 8 }}>
          <div className="cal-arrow" onClick={() => shiftMonth(-1)}><i className="ti ti-chevron-left"></i></div>
          <div style={{ fontSize: 14, color: 'var(--ink-l)', minWidth: 100, textAlign: 'center' }}>{formatMonthLong(month)}</div>
          <div className="cal-arrow" onClick={() => shiftMonth(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
      </div>

      <div className="fl-body">
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">来店数</div><div className="kpi-val">{visitCount}件</div><div className="kpi-sub">{formatMonthLong(month)}</div></div>
          <div className="kpi"><div className="kpi-label">既存客売上</div><div className="kpi-val">{yen(existingSales)}</div><div className="kpi-sub">@ {exRate}%</div></div>
          <div className="kpi"><div className="kpi-label">新規客売上</div><div className="kpi-val">{yen(newSales)}</div><div className="kpi-sub">@ {nwRate}%</div></div>
          <div className="kpi"><div className="kpi-label">店販売上</div><div className="kpi-val">{yen(retailSales)}</div><div className="kpi-sub">@ {retailRate}%</div></div>
        </div>
        <div className="fl-kpis">
          <div className="kpi"><div className="kpi-label">合計売上</div><div className="kpi-val" style={{ color: 'var(--accent)' }}>{yen(totalSales)}</div><div className="kpi-sub">施術＋店販</div></div>
        </div>

        {isContract ? (
          <div className="tbl-wrap" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 12 }}>報酬内訳</div>
            <div className="flc-breakdown">
              <div className="flc-row"><span className="flc-key">既存客報酬（{exRate}%）</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(exReward)}</span></div>
              <div className="flc-row"><span className="flc-key">新規客報酬（{nwRate}%）</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(nwReward)}</span></div>
              <div className="flc-row" style={{ border: 'none' }}><span className="flc-key">店販報酬（{retailRate}%）</span><span className="flc-val" style={{ color: 'var(--accent)' }}>{yen(retailReward)}</span></div>
            </div>
            <div className="flc-reward" style={{ marginTop: 12 }}>
              <span className="flc-reward-label">報酬合計</span>
              <span className="flc-reward-val">{yen(totalReward)}</span>
            </div>
          </div>
        ) : (
          <div className="empty-row">
            給与は別途計算されます。ここには売上実績のみ表示しています。
          </div>
        )}
      </div>
    </div>
  );
}
