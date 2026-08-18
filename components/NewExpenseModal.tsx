'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatDateLong } from '@/lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
}

export default function NewExpenseModal({ open, onClose, date }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (!itemName.trim()) {
      setError('項目名を入力してください。');
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
      const { error } = await sb.from('expenses').insert({
        expense_date: date,
        item_name: itemName.trim(),
        amount: Number(amount),
      });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setItemName('');
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
          <div className="modal-title">経費を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">日付</label>
            <div style={{ fontSize: 14, color: 'var(--ink)' }}>{formatDateLong(date)}</div>
          </div>
          <div className="f-row">
            <label className="f-label">項目名</label>
            <input
              className="f-input"
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="例: 消耗品費"
              autoFocus
            />
          </div>
          <div className="f-row" style={{ marginBottom: 0 }}>
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
