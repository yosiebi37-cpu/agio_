'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

const MENUS = [
  'カット',
  'カット + カラー',
  'ハイライトカラー',
  'グレイカラー',
  'フルカラー',
  'デジタルパーマ',
  '縮毛矯正',
  'トリートメント',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewBookingModal({ open, onClose }: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [staffId, setStaffId] = useState('');
  const [menu, setMenu] = useState(MENUS[0]);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim() || !staffId) {
      setError('お客様名と担当スタイリストを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('bookings').insert({
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
          <div className="modal-title">新規予約を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">お客様名</label>
            <input className="f-input" type="text" placeholder="山田 花子" value={name} onChange={(e) => setName(e.target.value)} />
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
            <select className="f-select" value={menu} onChange={(e) => setMenu(e.target.value)}>
              {MENUS.map((m) => <option key={m}>{m}</option>)}
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
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--red)' }}>{error}</div>
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
