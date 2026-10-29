'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import { formatDateSlash, hiraganaToKatakana } from '@/lib/format';
import NewCustomerModal from './NewCustomerModal';
import { findDuplicateIds } from '@/lib/customer-match';
import type { Staff, CustomerWithStaff } from '@/lib/types';

interface Props {
  customers: CustomerWithStaff[];
  staff: Staff[];
}

const lacksBirthday = (c: CustomerWithStaff) => !c.birth_year || !c.birth_month || !c.birth_day;
const lacksPhone = (c: CustomerWithStaff) => !(c.phone ?? '').trim();

export default function CustomersClient({ customers, staff }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [stylist, setStylist] = useState('all');
  const [missing, setMissing] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const missingCount = useMemo(() => customers.filter((c) => lacksBirthday(c) || lacksPhone(c)).length, [customers]);
  // 前日のLINEリマインドが届くお客様（LINEと連携済み）の人数
  const lineLinkedCount = useMemo(() => customers.filter((c) => c.line_user_id).length, [customers]);
  // 名前または電話番号が同じ登録（二重登録の可能性）
  const duplicateIds = useMemo(() => findDuplicateIds(customers), [customers]);

  const filtered = useMemo(() => {
    const kw = q.trim();
    // フリガナはカタカナで保存されているため、ひらがなで検索しても見つかるように変換して比較する
    const kwKatakana = hiraganaToKatakana(kw);
    return customers.filter((c) => {
      if (type !== 'all' && c.customer_type !== type) return false;
      if (stylist !== 'all' && (c.staff?.name ?? '') !== stylist) return false;
      if (missing === 'any' && !(lacksBirthday(c) || lacksPhone(c))) return false;
      if (missing === 'birthday' && !lacksBirthday(c)) return false;
      if (missing === 'phone' && !lacksPhone(c)) return false;
      if (missing === 'duplicate' && !duplicateIds.has(c.id)) return false;
      if (missing === 'line' && !c.line_user_id) return false;
      if (missing === 'noline' && c.line_user_id) return false;
      if (kw && !(c.name.includes(kw) || (c.furigana ?? '').includes(kwKatakana) || (c.phone ?? '').includes(kw))) return false;
      return true;
    });
  }, [customers, q, type, stylist, missing, duplicateIds]);

  return (
    <div className="page-wrap">
      <div className="inner-page">
        <div className="page-head">
          <div>
            <div className="page-h1">顧客管理</div>
            <div className="page-sub">{customers.length}名登録済み ・ 生年月日/電話番号の未入力あり {missingCount}名{duplicateIds.size > 0 && ` ・ 重複の可能性あり ${duplicateIds.size}件`} ・ LINE連携 {lineLinkedCount}名</div>
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
          <select className="sel" value={missing} onChange={(e) => setMissing(e.target.value)}>
            <option value="all">入力状況：すべて</option>
            <option value="any">未入力あり（生年月日 or 電話）</option>
            <option value="birthday">生年月日が未入力</option>
            <option value="phone">電話番号が未入力</option>
            <option value="duplicate">重複の可能性あり（同じ名前・電話番号）</option>
            <option value="line">LINE連携済み</option>
            <option value="noline">LINE未連携（前日のLINEリマインドが届かない）</option>
          </select>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>お客様名</th><th>未入力</th><th>区分</th><th>担当</th><th>最終来店</th><th>来店回数</th><th>平均周期</th><th>次回提案</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/karte/${c.id}`)}>
                  <td>
                    <div className="name-link">
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: c.avatar_bg, color: c.avatar_fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        {c.initials}
                      </div>
                      <span>
                        {c.name}
                        {c.line_user_id && <span className="tag" style={{ marginLeft: 6, fontSize: 11, color: '#06C755', border: '1px solid #06C755' }}>LINE</span>}
                        {c.furigana && <div style={{ fontSize: 12, color: 'var(--ink-l)' }}>{c.furigana}</div>}
                      </span>
                      <i className="ti ti-chevron-right" style={{ fontSize: 14, opacity: 0.5 }}></i>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {lacksBirthday(c) && <span className="tag" style={{ color: 'var(--red)', border: '1px solid var(--red)' }}>生年月日</span>}
                      {lacksPhone(c) && <span className="tag" style={{ color: 'var(--red)', border: '1px solid var(--red)' }}>電話</span>}
                      {duplicateIds.has(c.id) && <span className="tag" style={{ color: 'var(--gold-d)', border: '1px solid var(--gold-d)' }}>重複?</span>}
                    </div>
                  </td>
                  <td><span className={`tag ${TYPE_TAG_CLASS[c.customer_type]}`}>{TYPE_LABEL[c.customer_type]}</span></td>
                  <td>{c.staff?.name ?? '—'}</td>
                  <td>{formatDateSlash(c.last_visit_on)}</td>
                  <td>{c.visit_count}回</td>
                  <td>{c.avg_cycle_days ? `${c.avg_cycle_days}日` : '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-l)' }}>{c.next_target ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="empty-row">該当する顧客がいません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <NewCustomerModal open={modalOpen} onClose={() => setModalOpen(false)} staff={staff} />
    </div>
  );
}
