'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { Staff, MenuItem, TreatmentRecord } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  treatment: TreatmentRecord;
  staff: Staff[];
}

export default function EditTreatmentModal({ open, onClose, treatment, staff }: Props) {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [performedOn, setPerformedOn] = useState(treatment.performed_on);
  const [staffId, setStaffId] = useState(treatment.staff_id ?? '');
  const [menu, setMenu] = useState(treatment.menu);
  const [amount, setAmount] = useState(String(treatment.amount ?? 0));
  const [tags, setTags] = useState(treatment.tags.join(', '));
  const [note, setNote] = useState(treatment.note ?? '');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPerformedOn(treatment.performed_on);
    setStaffId(treatment.staff_id ?? '');
    setMenu(treatment.menu);
    setAmount(String(treatment.amount ?? 0));
    setTags(treatment.tags.join(', '));
    setNote(treatment.note ?? '');
    const sb = getBrowserSupabase();
    sb.from('menu_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setMenuItems((data ?? []).length ? (data as MenuItem[]) : FALLBACK_MENUS);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, treatment]);

  if (!open) return null;

  const handleMenuChange = (value: string) => {
    setMenu(value);
    const item = menuItems.find((m) => m.name === value);
    if (item) setAmount(String(item.price));
  };

  const submit = async () => {
    if (!menu.trim()) {
      setError('メニューを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error: updateError } = await sb
        .from('treatment_records')
        .update({
          staff_id: staffId || null,
          performed_on: performedOn,
          menu: menu.trim(),
          amount: parseInt(amount, 10) || 0,
          tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
          note: note.trim() || null,
        })
        .eq('id', treatment.id);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('この施術履歴を削除しますか？')) return;
    setSaving(true);
    setError(null);
    const sb = getBrowserSupabase();
    const { error: deleteError } = await sb.from('treatment_records').delete().eq('id', treatment.id);
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    router.refresh();
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">施術履歴を編集</div>
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
            <label className="f-label">メニュー</label>
            <input
              className="f-input"
              type="text"
              list="et-menu-options"
              value={menu}
              onChange={(e) => handleMenuChange(e.target.value)}
              placeholder="カット"
            />
            <datalist id="et-menu-options">
              {menuItems.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">金額 (円)</label>
              <input className="f-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="f-label">タグ（カンマ区切り）</label>
              <input className="f-input" type="text" placeholder="縮毛矯正, トリートメント" value={tags} onChange={(e) => setTags(e.target.value)} />
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
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <button className="btn-cancel" style={{ color: 'var(--red)' }} onClick={remove} disabled={saving}>削除</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-cancel" onClick={onClose}>キャンセル</button>
            <button className="btn-save" onClick={submit} disabled={saving}>
              {saving ? '保存中…' : '変更を保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
