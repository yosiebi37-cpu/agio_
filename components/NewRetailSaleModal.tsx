'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatDateLong } from '@/lib/format';
import type { Staff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  staff: Staff[];
}

export default function NewRetailSaleModal({ open, onClose, date, staff }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (!productName.trim()) {
      setError('商品名を入力してください。');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('金額を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('retail_sales').insert({
        sale_date: date,
        staff_id: staffId || null,
        product_name: productName.trim(),
        amount: Number(amount),
      });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setProductName('');
      setAmount('');
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">店販を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">日付</label>
            <div style={{ fontSize: 14, color: 'var(--ink)' }}>{formatDateLong(date)}</div>
          </div>
          <div className="f-row">
            <label className="f-label">商品名</label>
            <input
              className="f-input"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="例: シャンプー"
              autoFocus
            />
          </div>
          <div className="f-row2" style={{ marginBottom: 0 }}>
            <div>
              <label className="f-label">金額</label>
              <input
                className="f-input"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="f-label">担当スタッフ</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}
