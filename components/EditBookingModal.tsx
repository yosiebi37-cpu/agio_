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
  const [menu, setMenu] = useState(booking.menu);
  const [type, setType] = useState<'existing' | 'new'>(booking.customer_type);
  const [amount, setAmount] = useState(String(booking.amount ?? 0));
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

  const handleMenuChange = (value: string) => {
    setMenu(value);
    const item = menuItems.find((m) => m.name === value);
    if (item) setAmount(String(item.price));
  };

  const submit = async () => {
    if (!customerName.trim() || !staffId) {
      setError('お客様名と担当スタイリストを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error: updateError } = await sb
        .from('bookings')
        .update({
          customer_name: customerName.trim(),
          staff_id: staffId,
          booking_date: date,
          start_time: start,
          end_time: end,
          menu,
          customer_type: type,
          amount: parseInt(amount, 10) || 0,
          note: note.trim() || null,
        })
        .eq('id', booking.id);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
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
          <div className="f-row">
            <label className="f-label">メニュー</label>
            <input
              className="f-input"
              type="text"
              list="eb-menu-options"
              value={menu}
              onChange={(e) => handleMenuChange(e.target.value)}
              placeholder="カット"
            />
            <datalist id="eb-menu-options">
              {menuItems.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">区分</label>
              <select className="f-select" value={type} onChange={(e) => setType(e.target.value as 'existing' | 'new')}>
                <option value="existing">既存客</option>
                <option value="new">新規客（店舗）</option>
              </select>
            </div>
            <div>
              <label className="f-label">金額 (円)</label>
              <input className="f-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
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
