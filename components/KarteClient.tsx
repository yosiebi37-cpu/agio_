'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import { yenK, formatDateLong } from '@/lib/format';
import EditCustomerModal from './EditCustomerModal';
import NewTreatmentModal from './NewTreatmentModal';
import NewChemicalModal from './NewChemicalModal';
import type { Customer, TreatmentRecord, ChemicalRecord, Staff } from '@/lib/types';

type CustomerWithStaff = Customer & { staff?: { name: string } | null };
type TreatmentWithStaff = TreatmentRecord & { staff?: { name: string } | null };

interface Props {
  customer: CustomerWithStaff;
  treatments: TreatmentWithStaff[];
  chemicals: ChemicalRecord[];
  staff: Staff[];
}

type Tab = 'hist' | 'drug' | 'photo' | 'next';

export default function KarteClient({ customer: c, treatments, chemicals, staff }: Props) {
  const [tab, setTab] = useState<Tab>('hist');
  const [editOpen, setEditOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [chemicalOpen, setChemicalOpen] = useState(false);

  return (
    <div className="page-wrap">
      <div className="karte-shell">
        {/* left profile */}
        <div className="karte-left">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sand)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/customers" className="karte-back" style={{ marginBottom: 0 }}><i className="ti ti-arrow-left"></i>一覧へ戻る</Link>
            <button className="btn-sm" onClick={() => setEditOpen(true)}><i className="ti ti-edit"></i>編集</button>
          </div>
          <div className="karte-top">
            <div className="k-avatar" style={{ background: c.avatar_bg, color: c.avatar_fg }}>{c.initials}</div>
            {c.furigana && <div style={{ fontSize: 10, color: 'var(--ink-l)', marginBottom: 1 }}>{c.furigana}</div>}
            <div className="k-name">{c.name}</div>
            <div className="k-meta">
              {c.phone ?? '—'}<br />{c.birth_year ? `${c.birth_year}年生まれ` : ''}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className={`tag ${TYPE_TAG_CLASS[c.customer_type]}`}>{TYPE_LABEL[c.customer_type]}</span>
            </div>
          </div>
          <div className="k-stats">
            <div className="ks-item"><div className="ks-val">{c.visit_count}</div><div className="ks-label">来店回数</div></div>
            <div className="ks-item"><div className="ks-val">{yenK(c.lifetime_value)}</div><div className="ks-label">累計売上</div></div>
            <div className="ks-item"><div className="ks-val">{c.avg_cycle_days ? `${c.avg_cycle_days}日` : '—'}</div><div className="ks-label">平均周期</div></div>
          </div>
          <div className="karte-info">
            <div className="ki-row">
              <div className="ki-icon" style={{ background: 'var(--accent-l)', color: 'var(--accent)' }}><i className="ti ti-user"></i></div>
              <div><div className="ki-label">担当</div><div className="ki-val">{c.staff?.name ?? '—'}</div></div>
            </div>
            <div className="ki-row">
              <div className="ki-icon" style={{ background: 'var(--gold-l)', color: 'var(--gold-d)' }}><i className="ti ti-sparkles"></i></div>
              <div><div className="ki-label">髪質</div><div className="ki-val">{c.hair_type ?? '—'}</div></div>
            </div>
            <div className="ki-row">
              <div className="ki-icon" style={{ background: '#F5F5F5', color: '#B94040' }}><i className="ti ti-alert-triangle"></i></div>
              <div>
                <div className="ki-label">アレルギー</div>
                {c.allergy_tag ? (
                  <div>
                    <span className="allergy-tag"><i className="ti ti-alert-circle" style={{ fontSize: 10 }}></i>{c.allergy_tag}</span>
                    {c.allergy_note && <div style={{ fontSize: 11, color: 'var(--ink-m)', marginTop: 4 }}>{c.allergy_note}</div>}
                  </div>
                ) : (
                  <div className="ki-val">特になし</div>
                )}
              </div>
            </div>
            <div className="ki-row">
              <div className="ki-icon" style={{ background: 'var(--accent-l)', color: 'var(--accent)' }}><i className="ti ti-calendar"></i></div>
              <div><div className="ki-label">最終来店</div><div className="ki-val">{c.last_visit_on ? formatDateLong(c.last_visit_on) : '—'}</div></div>
            </div>
            <div className="ki-row" style={{ border: 'none' }}>
              <div className="ki-icon" style={{ background: 'var(--sand)', color: 'var(--ink-m)' }}><i className="ti ti-calendar-plus"></i></div>
              <div><div className="ki-label">次回予定</div><div className="ki-val">{c.next_target ?? '—'}</div></div>
            </div>
          </div>
        </div>

        {/* right content */}
        <div className="karte-right">
          <div className="karte-right-inner">
            <div className="ktabs">
              <div className={`ktab${tab === 'hist' ? ' active' : ''}`} onClick={() => setTab('hist')}><i className="ti ti-history"></i>施術履歴</div>
              <div className={`ktab${tab === 'drug' ? ' active' : ''}`} onClick={() => setTab('drug')}><i className="ti ti-flask"></i>薬剤記録</div>
              <div className={`ktab${tab === 'photo' ? ' active' : ''}`} onClick={() => setTab('photo')}><i className="ti ti-camera"></i>写真</div>
              <div className={`ktab${tab === 'next' ? ' active' : ''}`} onClick={() => setTab('next')}><i className="ti ti-bulb"></i>次回提案</div>
            </div>

            {tab === 'hist' && (
              <div className="kcard">
                <div className="kcard-head"><div className="kcard-title">施術履歴</div><button className="btn-sm" onClick={() => setTreatmentOpen(true)}><i className="ti ti-plus"></i>新規記録</button></div>
                <div className="hist-wrap">
                  {treatments.length === 0 && <div className="empty-row">施術履歴がまだありません。</div>}
                  {treatments.map((t) => (
                    <div className="hist-item" key={t.id}>
                      <div className="hist-dot" style={{ background: t.dot_bg, color: t.dot_fg }}><i className={`ti ti-${t.icon}`} style={{ fontSize: 10 }}></i></div>
                      <div className="hist-body">
                        <div className="hist-date">{formatDateLong(t.performed_on)}　{t.staff?.name ?? ''}</div>
                        <div className="hist-menu">{t.menu}</div>
                        <div className="hist-amount">{'¥' + (t.amount ?? 0).toLocaleString('ja-JP')}</div>
                        {t.tags.length > 0 && (
                          <div className="hist-tags">
                            {t.tags.map((tg, i) => <span className="tag tag-ok" key={i}>{tg}</span>)}
                          </div>
                        )}
                        {t.note && <div className="hist-note">{t.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'drug' && (
              <div className="kcard">
                <div className="kcard-head"><div className="kcard-title">薬剤・カラー記録</div><button className="btn-sm" onClick={() => setChemicalOpen(true)}><i className="ti ti-plus"></i>追加</button></div>
                <div className="drug-grid">
                  {chemicals.map((d) => (
                    <div className="drug-card" key={d.id}>
                      <div className="drug-date">{formatDateLong(d.record_on)}</div>
                      <div className="drug-type-label"><span style={{ width: 7, height: 7, borderRadius: '50%', background: d.dot_color, display: 'inline-block' }}></span>{d.type_label}</div>
                      {d.brand && <div className="drow"><span className="dk">ブランド</span><span className="dv">{d.brand}</span></div>}
                      {d.color_code && <div className="drow"><span className="dk">色番</span><span className="dv">{d.color_code}</span></div>}
                      {d.oxy && <div className="drow"><span className="dk">オキシ</span><span className="dv">{d.oxy}</span></div>}
                      {d.processing_time && <div className="drow"><span className="dk">放置時間</span><span className="dv">{d.processing_time}</span></div>}
                      {d.finish_note && <div className="drow"><span className="dk">仕上がり</span><span className="dv">{d.finish_note}</span></div>}
                      {d.patch_test != null && <div className="drow"><span className="dk">パッチテスト</span><span className="dv" style={{ color: d.patch_test ? 'var(--green)' : 'var(--red)' }}>{d.patch_test ? '✓ 実施済' : '未実施'}</span></div>}
                    </div>
                  ))}
                  <div
                    className="drug-card"
                    style={{ borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, cursor: 'pointer', color: 'var(--ink-l)' }}
                    onClick={() => setChemicalOpen(true)}
                  >
                    <div style={{ textAlign: 'center' }}><i className="ti ti-plus" style={{ fontSize: 22, display: 'block', marginBottom: 5 }}></i><span style={{ fontSize: 11 }}>記録を追加</span></div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'photo' && (
              <div className="kcard">
                <div className="kcard-head"><div className="kcard-title">ビフォーアフター写真</div><button className="btn-sm"><i className="ti ti-upload"></i>アップロード</button></div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>サンプル表示</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-l)', marginBottom: 5 }}>ビフォー</div>
                      <div style={{ height: 140, background: 'linear-gradient(135deg,var(--sand),var(--sand-d))', borderRadius: 7, border: '1px solid var(--sand-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>📷</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-l)', marginBottom: 5 }}>アフター</div>
                      <div style={{ height: 140, background: 'linear-gradient(135deg,var(--accent-l),var(--gold-l))', borderRadius: 7, border: '1px solid var(--sand-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>✨</div>
                    </div>
                  </div>
                </div>
                <div className="upload-zone"><i className="ti ti-cloud-upload"></i><p>ドラッグ＆ドロップ または クリックでアップロード</p><p style={{ marginTop: 3, fontSize: 10 }}>Supabase Storage（karte-photos バケット）に保存予定</p></div>
              </div>
            )}

            {tab === 'next' && (
              <div className="kcard">
                <div className="kcard-head"><div className="kcard-title">次回提案メモ</div><button className="btn-sm" onClick={() => setEditOpen(true)}><i className="ti ti-edit"></i>編集</button></div>
                <div className="next-box">
                  <div className="next-label">次回おすすめ施術</div>
                  <div className="next-text">{c.next_suggestion ?? '提案メモはまだありません。'}</div>
                </div>
                <div className="next-chips">
                  {c.next_target && <span className="nchip">📅 {c.next_target}</span>}
                  {c.next_price && <span className="nchip">💰 {c.next_price}</span>}
                  {c.next_duration && <span className="nchip">⏱ {c.next_duration}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <EditCustomerModal open={editOpen} onClose={() => setEditOpen(false)} customer={c} staff={staff} />
      <NewTreatmentModal open={treatmentOpen} onClose={() => setTreatmentOpen(false)} customerId={c.id} staff={staff} />
      <NewChemicalModal open={chemicalOpen} onClose={() => setChemicalOpen(false)} customerId={c.id} />
    </div>
  );
}
