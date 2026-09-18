'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate, initialsFromName } from '@/lib/format';
import { FALLBACK_MENUS } from '@/lib/constants';
import { useFuriganaAutofill } from '@/lib/useFuriganaAutofill';
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
  const [showDropdown, setShowDropdown] = useState(false);
  const { furigana, onFuriganaChange, nameCompositionHandlers, reset: resetFurigana } = useFuriganaAutofill();
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
        .then(async ({ data, error: customersError }) => {
          if (customersError?.message.toLowerCase().includes('furigana')) {
            const retry = await sb.from('customers').select('id,name').order('name');
            setCustomers(((retry.data ?? []) as { id: string; name: string }[]).map((c) => ({ ...c, furigana: null })));
            return;
          }
          setCustomers((data ?? []) as CustomerOption[]);
        });
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
        let { data: newCustomer, error: customerError } = await sb
          .from('customers')
          .insert({
            name: name.trim(),
            furigana: furigana.trim() || null,
            initials: initialsFromName(name),
            customer_type: type,
          })
          .select('id,name,furigana')
          .single();
        if (customerError?.message.toLowerCase().includes('furigana')) {
          // furigana 列が使えない環境（キャッシュ未反映・列不足など）では、
          // フリガナなしで再試行する（後で顧客管理から追記できる）
          const retry = await sb
            .from('customers')
            .insert({
              name: name.trim(),
              initials: initialsFromName(name),
              customer_type: type,
            })
            .select('id,name')
            .single();
          newCustomer = retry.data ? { ...retry.data, furigana: null } : null;
          customerError = retry.error;
        }
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
      resetFurigana();
      onClose();
      router.push(`/board?date=${date}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const matchedCustomer = customers.find((c) => c.name === name.trim());
  const searchResults = useMemo(() => {
    const q = name.trim();
    if (!q || matchedCustomer) return [];
    return customers.filter((c) => c.name.includes(q) || (c.furigana ?? '').includes(q)).slice(0, 8);
  }, [customers, name, matchedCustomer]);

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
                onChange={onFuriganaChange}
              />
            )}
            <label className="f-label">お客様名</label>
            <div style={{ position: 'relative' }}>
              <input
                className="f-input"
                type="text"
                placeholder="山田 花子（検索できます）"
                value={name}
                onChange={(e) => { setName(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                {...(matchedCustomer ? {} : nameCompositionHandlers)}
              />
              {showDropdown && searchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
                    background: 'var(--cream)', border: '1px solid var(--sand-d)', borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto',
                  }}
                >
                  {searchResults.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={(e) => { e.preventDefault(); setName(c.name); setShowDropdown(false); }}
                      style={{ padding: '8px 12px', fontSize: 14, cursor: 'pointer', borderBottom: '1px solid var(--sand)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sand)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>{c.name}</div>
                      {c.furigana && <div style={{ fontSize: 11, color: 'var(--ink-l)' }}>{c.furigana}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!matchedCustomer && name.trim() && (
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 4 }}>
                {searchResults.length > 0 ? '一致するお客様がいなければ、新しいお客様として登録されます' : '新しいお客様として登録されます'}
              </div>
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
            <input
              className="f-input"
              type="text"
              list="nb-menu-options"
              value={menu}
              onChange={(e) => handleMenuChange(e.target.value)}
              placeholder="カット"
            />
            <datalist id="nb-menu-options">
              {menuItems.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
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
