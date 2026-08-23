'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate, initialsFromName } from '@/lib/format';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { Staff, MenuItem } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface CustomerOption {
  id: string;
  name: string;
  furigana: string | null;
}

export default function NewBookingModal({ open, onClose }: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [staffId, setStaffId] = useState('');
  const [menu, setMenu] = useState('');
  const [type, setType] = useState<'existing' | 'new'>('existing');
  const [amount, setAmount] = useState('8800');

  useEffect(() => {
    if (!open) return;
    setError(null);
    try {
      const sb = getBrowserSupabase();
      sb.from('staff')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data, error }) => {
          if (error) {
            setError(error.message);
            return;
          }
          const list = (data ?? []) as Staff[];
          setStaff(list);
          if (list.length && !staffId) setStaffId(list[0].id);
        });
      sb.from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data }) => {
          const list = (data ?? []).length ? (data as MenuItem[]) : FALLBACK_MENUS;
          setMenuItems(list);
          if (list.length && !menu) {
            setMenu(list[0].name);
            setAmount(String(list[0].price));
          }
        });
      sb.from('customers')
        .select('id,name,furigana')
        .order('name')
        .then(({ data }) => setCustomers((data ?? []) as CustomerOption[]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleMenuChange = (value: string) => {
    setMenu(value);
    const item = menuItems.find((m) => m.name === value);
    if (item) setAmount(String(item.price));
  };

  const submit = async () => {
    if (!name.trim() || !staffId) {
      setError('お客様名と担当スタイリストを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      let matchedCustomer = customers.find((c) => c.name === name.trim());
      if (!matchedCustomer) {
        const { data: newCustomer, error: customerError } = await sb
          .from('customers')
          .insert({
            name: name.trim(),
            furigana: furigana.trim() || null,
            initials: initialsFromName(name),
            customer_type: type,
          })
          .select('id,name,furigana')
          .single();
        if (customerError) {
          setError(customerError.message);
          setSaving(false);
          return;
        }
        matchedCustomer = newCustomer as CustomerOption;
      }
      const { error } = await sb.from('bookings').insert({
        customer_id: matchedCustomer.id,
        customer_name: name.trim(),
        staff_id: staffId,
        booking_date: date,
        start_time: start,
        end_time: end,
        menu,
        status: 'confirmed',
        customer_type: type,
        amount: parseInt(amount, 10) || 0,
      });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setName('');
      setFurigana('');
      onClose();
      router.push(`/board?date=${date}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const matchedCustomer = customers.find((c) => c.name === name.trim());

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">新規予約を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row f-name-group">
            <label className="f-label f-label-ruby">フリガナ</label>
            {matchedCustomer ? (
              <div className="f-input f-input-ruby" style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-l)' }}>
                {matchedCustomer.furigana ?? ''}
              </div>
            ) : (
              <input
                className="f-input f-input-ruby"
                type="text"
                placeholder="ヤマダ ハナコ"
                value={furigana}
                onChange={(e) => setFurigana(e.target.value)}
              />
            )}
            <label className="f-label">お客様名</label>
            <input
              className="f-input"
              type="text"
              placeholder="山田 花子"
              list="nb-customer-options"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <datalist id="nb-customer-options">
              {customers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
            {!matchedCustomer && name.trim() && (
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 4 }}>新しいお客様として登録されます</div>
            )}
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
            <select className="f-select" value={menu} onChange={(e) => handleMenuChange(e.target.value)}>
              {menuItems.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div className="f-row2" style={{ marginBottom: 0 }}>
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
          {error && (
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '登録中…' : '予約を登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
