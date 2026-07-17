'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import { formatDateSlash } from '@/lib/format';
import NewCustomerModal from './NewCustomerModal';
import type { Staff, CustomerWithStaff } from '@/lib/types';

interface Props {
  customers: CustomerWithStaff[];
  staff: Staff[];
}

export default function CustomersClient({ customers, staff }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [stylist, setStylist] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const kw = q.trim();
    return customers.filter((c) => {
      if (type !== 'all' && c.customer_type !== type) return false;
      if (stylist !== 'all' && (c.staff?.name ?? '') !== stylist) return false;
      if (kw && !(c.name.includes(kw) || (c.furigana ?? '').includes(kw) || (c.phone ?? '').includes(kw))) return false;
      return true;
    });
  }, [customers, q, type, stylist]);

  return (
    <div className="page-wrap">
      <div className="inner-page">
        <div className="page-head">
          <div>
            <div className="page-h1">顧客管理</div>
            <div className="page-sub">{customers.length}名登録済み</div>
          </div>
          <button className="btn-new" onClick={() => setModalOpen(true)}>
            <i className="ti ti-plus"></i>新規登録
          </button>
        </div>

        <div className="search-row">
          <input
            className="search-input"
            placeholder="🔍　顧客名・電話番号で検索..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">すべて</option>
            <option value="existing">既存客</option>
            <option value="new">新規客</option>
          </select>
          <select className="sel" value={stylist} onChange={(e) => setStylist(e.target.value)}>
            <option value="all">全スタイリスト</option>
            {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>お客様名</th><th>区分</th><th>担当</th><th>最終来店</th><th>来店回数</th><th>平均周期</th><th>次回提案</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/karte/${c.id}`)}>
                  <td>
                    <div className="name-link">
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: c.avatar_bg, color: c.avatar_fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                        {c.initials}
                      </div>
                      <span>
                        {c.name}
                        {c.furigana && <div style={{ fontSize: 10, color: 'var(--ink-l)' }}>{c.furigana}</div>}
                      </span>
                      <i className="ti ti-chevron-right" style={{ fontSize: 12, opacity: 0.5 }}></i>
                    </div>
                  </td>
                  <td><span className={`tag ${TYPE_TAG_CLASS[c.customer_type]}`}>{TYPE_LABEL[c.customer_type]}</span></td>
                  <td>{c.staff?.name ?? '—'}</td>
                  <td>{formatDateSlash(c.last_visit_on)}</td>
                  <td>{c.visit_count}回</td>
                  <td>{c.avg_cycle_days ? `${c.avg_cycle_days}日` : '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--ink-l)' }}>{c.next_target ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7}><div className="empty-row">該当する顧客がいません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <NewCustomerModal open={modalOpen} onClose={() => setModalOpen(false)} staff={staff} />
    </div>
  );
}
