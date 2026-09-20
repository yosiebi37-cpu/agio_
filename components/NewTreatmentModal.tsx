'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate, toMinutes, minutesToHHMM } from '@/lib/format';
import { FALLBACK_MENUS, FALLBACK_RETAIL_PRODUCTS } from '@/lib/constants';
import type { Staff, MenuItem, RetailProduct } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  staff: Staff[];
  defaultDate?: string;
  defaultTime?: string;
}

const DEFAULT_MENU_MINUTES = 60;

const currentTimeHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface LineItem {
  name: string;
  amount: string;
}

const emptyLine = (): LineItem => ({ name: '', amount: '' });

export default function NewTreatmentModal({ open, onClose, customerId, customerName, staff, defaultDate, defaultTime }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [retailProducts, setRetailProducts] = useState<RetailProduct[]>([]);

  const [performedOn, setPerformedOn] = useState(() => defaultDate ?? toISODate(new Date()));
  const [startTime, setStartTime] = useState(() => defaultTime ?? currentTimeHHMM());
  const [staffId, setStaffId] = useState('');
  const [menuLines, setMenuLines] = useState<LineItem[]>([emptyLine()]);
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [retailLines, setRetailLines] = useState<LineItem[]>([]);

  useEffect(() => {
    if (!open) return;
    const sb = getBrowserSupabase();
    sb.from('menu_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const list = (data ?? []).length ? (data as MenuItem[]) : FALLBACK_MENUS;
        setMenuItems(list);
        setMenuLines((prev) => {
          if (prev.length === 1 && !prev[0].name && list.length) {
            return [{ name: list[0].name, amount: String(list[0].price) }];
          }
          return prev;
        });
      });
    sb.from('retail_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const list = (data as RetailProduct[] | null) ?? [];
        setRetailProducts(list.length ? list : FALLBACK_RETAIL_PRODUCTS);
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

  const updateRetailLine = (idx: number, name: string) => {
    const match = retailProducts.find((p) => p.name === name);
    setRetailLines((prev) => prev.map((l, i) => (i === idx ? { name, amount: match ? String(match.price) : l.amount } : l)));
  };

  const updateRetailAmount = (idx: number, amount: string) => {
    setRetailLines((prev) => prev.map((l, i) => (i === idx ? { ...l, amount } : l)));
  };

  const reset = () => {
    setPerformedOn(defaultDate ?? toISODate(new Date()));
    setStartTime(defaultTime ?? currentTimeHHMM());
    setStaffId('');
    setMenuLines([menuItems.length ? { name: menuItems[0].name, amount: String(menuItems[0].price) } : emptyLine()]);
    setTags('');
    setNote('');
    setRetailLines([]);
  };

  const submit = async () => {
    const validMenuLines = menuLines.filter((l) => l.name.trim());
    if (validMenuLines.length === 0) {
      setError('メニューを入力してください。');
      return;
    }
    const validRetailLines = retailLines.filter((l) => l.name.trim());
    if (validRetailLines.some((l) => !l.amount || Number(l.amount) <= 0)) {
      setError('店販の金額を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const combinedMenu = validMenuLines.map((l) => l.name.trim()).join('＋');
      const totalAmount = validMenuLines.reduce((s, l) => s + (parseInt(l.amount, 10) || 0), 0);

      // 予約ボードにも「来店済み」として反映するため、担当が未指定なら「フリー」枠を使う
      const bookingStaffId = staffId || staff.find((s) => s.name === 'フリー')?.id || null;
      let bookingId: string | null = null;
      let boardWarning = '';
      if (bookingStaffId) {
        const totalMinutes = validMenuLines.reduce((s, l) => {
          const matched = menuItems.find((m) => m.name === l.name.trim());
          return s + (matched?.duration_minutes ?? DEFAULT_MENU_MINUTES);
        }, 0) || DEFAULT_MENU_MINUTES;
        const endTime = minutesToHHMM(toMinutes(startTime) + totalMinutes);
        const { data: newBooking, error: bookingError } = await sb
          .from('bookings')
          .insert({
            customer_id: customerId,
            customer_name: customerName,
            staff_id: bookingStaffId,
            booking_date: performedOn,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            menu: combinedMenu,
            status: 'visited',
            amount: totalAmount,
          })
          .select('id')
          .single();
        if (bookingError || !newBooking) {
          boardWarning = ' / 予約ボードへの反映に失敗しました';
        } else {
          bookingId = newBooking.id;
        }
      } else {
        boardWarning = ' / 担当スタイリストが未指定のため予約ボードには反映されませんでした';
      }

      const { error } = await sb.from('treatment_records').insert({
        customer_id: customerId,
        staff_id: staffId || null,
        booking_id: bookingId,
        performed_on: performedOn,
        menu: combinedMenu,
        amount: totalAmount,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        note: note.trim() || null,
      });
      if (error) {
        setError(error.message + boardWarning);
        setSaving(false);
        return;
      }
      if (validRetailLines.length) {
        const { error: retailError } = await sb.from('retail_sales').insert(
          validRetailLines.map((l) => ({
            sale_date: performedOn,
            staff_id: staffId || null,
            customer_id: customerId,
            booking_id: bookingId,
            product_name: l.name.trim(),
            amount: Number(l.amount),
          })),
        );
        if (retailError) {
          setError(`施術記録は保存しましたが、店販の記録に失敗しました: ${retailError.message}`);
          setSaving(false);
          router.refresh();
          return;
        }
      }
      if (boardWarning) {
        setError(`施術記録は保存しました${boardWarning}`);
        setSaving(false);
        router.refresh();
        return;
      }
      setSaving(false);
      reset();
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
          <div className="modal-title">施術記録を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">施術日</label>
              <input className="f-input" type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
            </div>
            <div>
              <label className="f-label">担当スタイリスト</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">未指定</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">開始時間</label>
            <input className="f-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 4 }}>
              この記録は自動で予約ボードにも「来店済み」として反映されます。
            </div>
          </div>

          <label className="f-label">メニュー</label>
          {menuLines.map((line, idx) => (
            <div key={idx} className="f-row2" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
              <div>
                <input
                  className="f-input"
                  type="text"
                  list="nt-menu-options"
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
          <datalist id="nt-menu-options">
            {menuItems.map((m) => <option key={m.id} value={m.name} />)}
          </datalist>
          <button className="btn-sm" style={{ marginBottom: 14 }} onClick={() => setMenuLines((prev) => [...prev, emptyLine()])}>
            <i className="ti ti-plus"></i>メニューを追加
          </button>

          <div className="f-row">
            <label className="f-label">タグ（カンマ区切り）</label>
            <input className="f-input" type="text" placeholder="縮毛矯正, トリートメント" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="f-row" style={{ marginBottom: 0 }}>
            <label className="f-label">メモ</label>
            <textarea className="f-input f-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ marginTop: 14, borderTop: '1px solid var(--sand)', paddingTop: 14 }}>
            <label className="f-label">店販（任意）</label>
            {retailLines.map((line, idx) => (
              <div key={idx} className="f-row2" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
                <div>
                  <select className="f-select" value={line.name} onChange={(e) => updateRetailLine(idx, e.target.value)}>
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
                    onChange={(e) => updateRetailAmount(idx, e.target.value)}
                    placeholder="金額"
                  />
                  <button className="btn-cancel" style={{ padding: '0 10px' }} onClick={() => setRetailLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <i className="ti ti-x"></i>
                  </button>
                </div>
              </div>
            ))}
            <button className="btn-sm" onClick={() => setRetailLines((prev) => [...prev, emptyLine()])}>
              <i className="ti ti-plus"></i>店販を追加
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '記録を追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
