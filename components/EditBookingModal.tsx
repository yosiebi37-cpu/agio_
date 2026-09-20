'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { Staff, MenuItem, BookingWithStaff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  booking: BookingWithStaff;
  staff: Staff[];
}

interface LineItem {
  name: string;
  amount: string;
}

const emptyLine = (): LineItem => ({ name: '', amount: '' });

const DISCOUNT_TYPES = ['ホットペッパーポイント', '紹介割引'];

export default function EditBookingModal({ open, onClose, booking, staff }: Props) {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState(booking.customer_name);
  const [date, setDate] = useState(booking.booking_date);
  const [start, setStart] = useState(booking.start_time.slice(0, 5));
  const [end, setEnd] = useState(booking.end_time.slice(0, 5));
  const [staffId, setStaffId] = useState(booking.staff_id);
  const [menuLines, setMenuLines] = useState<LineItem[]>([{ name: booking.menu, amount: String(booking.amount ?? 0) }]);
  const [discountLines, setDiscountLines] = useState<LineItem[]>([]);
  const [type, setType] = useState<'existing' | 'new'>(booking.customer_type);
  const [note, setNote] = useState(booking.note ?? '');

  useEffect(() => {
    if (!open) return;
    setError(null);
    const sb = getBrowserSupabase();
    sb.from('menu_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setMenuItems((data ?? []).length ? (data as MenuItem[]) : FALLBACK_MENUS);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const updateMenuLine = (idx: number, name: string) => {
    const item = menuItems.find((m) => m.name === name);
    setMenuLines((prev) => prev.map((l, i) => (i === idx ? { name, amount: item ? String(item.price) : l.amount } : l)));
  };

  const updateMenuAmount = (idx: number, amount: string) => {
    setMenuLines((prev) => prev.map((l, i) => (i === idx ? { ...l, amount } : l)));
  };

  const updateDiscountLine = (idx: number, name: string) => {
    setDiscountLines((prev) => prev.map((l, i) => (i === idx ? { ...l, name } : l)));
  };

  const updateDiscountAmount = (idx: number, amount: string) => {
    setDiscountLines((prev) => prev.map((l, i) => (i === idx ? { ...l, amount } : l)));
  };

  const submit = async () => {
    if (!customerName.trim() || !staffId) {
      setError('お客様名と担当スタイリストを入力してください。');
      return;
    }
    const validMenuLines = menuLines.filter((l) => l.name.trim());
    if (validMenuLines.length === 0) {
      setError('メニューを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const combinedMenu = validMenuLines.map((l) => l.name.trim()).join('＋');
      const menuTotal = validMenuLines.reduce((s, l) => s + (parseInt(l.amount, 10) || 0), 0);
      const validDiscountLines = discountLines.filter((l) => l.name.trim() && (parseInt(l.amount, 10) || 0) > 0);
      const discountTotal = validDiscountLines.reduce((s, l) => s + (parseInt(l.amount, 10) || 0), 0);
      const totalAmount = Math.max(0, menuTotal - discountTotal);
      const discountNote = validDiscountLines.length
        ? `割引：${validDiscountLines.map((l) => `${l.name.trim()} -¥${(parseInt(l.amount, 10) || 0).toLocaleString('ja-JP')}`).join('、')}`
        : '';
      const finalNote = [note.trim(), discountNote].filter(Boolean).join('\n');
      const { error: updateError } = await sb
        .from('bookings')
        .update({
          customer_name: customerName.trim(),
          staff_id: staffId,
          booking_date: date,
          start_time: start,
          end_time: end,
          menu: combinedMenu,
          customer_type: type,
          amount: totalAmount,
          note: finalNote || null,
        })
        .eq('id', booking.id);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
      if (booking.customer_id) {
        await sb
          .from('customers')
          .update({ name: customerName.trim(), customer_type: type })
          .eq('id', booking.customer_id);
        if (booking.status === 'visited') {
          await sb.from('treatment_records').upsert(
            {
              booking_id: booking.id,
              customer_id: booking.customer_id,
              staff_id: staffId,
              performed_on: date,
              menu: combinedMenu,
              amount: totalAmount,
              note: finalNote || null,
            },
            { onConflict: 'booking_id' },
          );
        }
      }
      setSaving(false);
      onClose();
      router.push(`/board?date=${date}`);
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
          <div className="modal-title">予約を編集</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">お客様名</label>
            <input className="f-input" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">日付</label>
              <input className="f-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="f-label">担当スタイリスト</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.employment_type === 'contract' ? '（委託）' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">開始時間</label>
              <input className="f-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="f-label">終了時間</label>
              <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <label className="f-label">メニュー</label>
          {menuLines.map((line, idx) => (
            <div key={idx} className="f-row2" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
              <div>
                <input
                  className="f-input"
                  type="text"
                  list="eb-menu-options"
                  value={line.name}
                  onChange={(e) => updateMenuLine(idx, e.target.value)}
                  placeholder="カット"
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="f-input"
                  type="number"
                  min="0"
                  value={line.amount}
                  onChange={(e) => updateMenuAmount(idx, e.target.value)}
                  placeholder="金額"
                />
                {menuLines.length > 1 && (
                  <button className="btn-cancel" style={{ padding: '0 10px' }} onClick={() => setMenuLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <i className="ti ti-x"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
          <datalist id="eb-menu-options">
            {menuItems.map((m) => <option key={m.id} value={m.name} />)}
          </datalist>
          <button className="btn-sm" style={{ marginBottom: 14 }} onClick={() => setMenuLines((prev) => [...prev, emptyLine()])}>
            <i className="ti ti-plus"></i>メニューを追加
          </button>

          <div style={{ marginTop: 4, borderTop: '1px solid var(--sand)', paddingTop: 14 }}>
            <label className="f-label">割引（任意）</label>
            {discountLines.map((line, idx) => (
              <div key={idx} className="f-row2" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
                <div>
                  <input
                    className="f-input"
                    type="text"
                    list="eb-discount-options"
                    value={line.name}
                    onChange={(e) => updateDiscountLine(idx, e.target.value)}
                    placeholder="ホットペッパーポイント"
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="f-input"
                    type="number"
                    min="0"
                    value={line.amount}
                    onChange={(e) => updateDiscountAmount(idx, e.target.value)}
                    placeholder="割引額"
                  />
                  <button className="btn-cancel" style={{ padding: '0 10px' }} onClick={() => setDiscountLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <i className="ti ti-x"></i>
                  </button>
                </div>
              </div>
            ))}
            <datalist id="eb-discount-options">
              {DISCOUNT_TYPES.map((d) => <option key={d} value={d} />)}
            </datalist>
            <button className="btn-sm" onClick={() => setDiscountLines((prev) => [...prev, emptyLine()])}>
              <i className="ti ti-plus"></i>割引を追加
            </button>
          </div>

          <div className="f-row" style={{ marginTop: 14 }}>
            <label className="f-label">区分</label>
            <select className="f-select" value={type} onChange={(e) => setType(e.target.value as 'existing' | 'new')}>
              <option value="existing">既存客</option>
              <option value="new">新規客（店舗）</option>
            </select>
          </div>
          <div className="f-row" style={{ marginBottom: 0 }}>
            <label className="f-label">メモ</label>
            <textarea className="f-input f-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '変更を保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
