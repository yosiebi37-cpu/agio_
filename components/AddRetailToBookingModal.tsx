'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { FALLBACK_RETAIL_PRODUCTS } from '@/lib/constants';
import type { RetailProduct } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerId: string | null;
  staffId: string;
  saleDate: string;
}

interface LineItem {
  name: string;
  amount: string;
}

const emptyLine = (): LineItem => ({ name: '', amount: '' });

export default function AddRetailToBookingModal({ open, onClose, bookingId, customerId, staffId, saleDate }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retailProducts, setRetailProducts] = useState<RetailProduct[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  useEffect(() => {
    if (!open) return;
    const sb = getBrowserSupabase();
    sb.from('retail_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const list = (data as RetailProduct[] | null) ?? [];
        setRetailProducts(list.length ? list : FALLBACK_RETAIL_PRODUCTS);
      });
  }, [open]);

  if (!open) return null;

  const updateLine = (idx: number, name: string) => {
    const match = retailProducts.find((p) => p.name === name);
    setLines((prev) => prev.map((l, i) => (i === idx ? { name, amount: match ? String(match.price) : l.amount } : l)));
  };

  const updateAmount = (idx: number, amount: string) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, amount } : l)));
  };

  const submit = async () => {
    const validLines = lines.filter((l) => l.name.trim());
    if (validLines.length === 0) {
      setError('店販を選択してください。');
      return;
    }
    if (validLines.some((l) => !l.amount || Number(l.amount) <= 0)) {
      setError('金額を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error: retailError } = await sb.from('retail_sales').insert(
        validLines.map((l) => ({
          sale_date: saleDate,
          staff_id: staffId || null,
          customer_id: customerId,
          booking_id: bookingId,
          product_name: l.name.trim(),
          amount: Number(l.amount),
        })),
      );
      if (retailError) {
        setError(retailError.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setLines([emptyLine()]);
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
          {lines.map((line, idx) => (
            <div key={idx} className="f-row2" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
              <div>
                <select className="f-select" value={line.name} onChange={(e) => updateLine(idx, e.target.value)} autoFocus={idx === 0}>
                  <option value="">選択してください</option>
                  {retailProducts.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="f-input"
                  type="number"
                  min="0"
                  value={line.amount}
                  onChange={(e) => updateAmount(idx, e.target.value)}
                  placeholder="金額"
                />
                {lines.length > 1 && (
                  <button className="btn-cancel" style={{ padding: '0 10px' }} onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <i className="ti ti-x"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
          <button className="btn-sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <i className="ti ti-plus"></i>店販を追加
          </button>
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
