'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatDateLong } from '@/lib/format';
import NewStaffModal from './NewStaffModal';
import EditStaffModal from './EditStaffModal';
import { yen } from '@/lib/format';
import type { Staff, SalonSettings, Holiday, MenuItem } from '@/lib/types';

interface Props {
  staff: Staff[];
  salonSettings: SalonSettings;
  holidays: Holiday[];
  menuItems: MenuItem[];
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function SettingsClient({ staff, salonSettings, holidays, menuItems }: Props) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set(salonSettings.closed_weekdays));
  const [savingWeekdays, setSavingWeekdays] = useState(false);

  const [holidayDate, setHolidayDate] = useState('');
  const [holidayNote, setHolidayNote] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);

  const [menuName, setMenuName] = useState('');
  const [menuPrice, setMenuPrice] = useState('');
  const [menuDuration, setMenuDuration] = useState('60');
  const [savingMenu, setSavingMenu] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const nextSortOrder = staff.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;
  const nextMenuSortOrder = menuItems.reduce((max, m) => Math.max(max, m.sort_order), 0) + 1;

  const toggleWeekday = (w: number) => {
    setClosedWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  };

  const saveWeekdays = async () => {
    setSavingWeekdays(true);
    try {
      const sb = getBrowserSupabase();
      await sb
        .from('salon_settings')
        .upsert({ id: 1, closed_weekdays: Array.from(closedWeekdays).sort(), updated_at: new Date().toISOString() });
      router.refresh();
    } finally {
      setSavingWeekdays(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayDate) {
      setHolidayError('日付を選択してください。');
      return;
    }
    setSavingHoliday(true);
    setHolidayError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('holidays').insert({ holiday_date: holidayDate, note: holidayNote.trim() || null });
      if (error) {
        setHolidayError(error.message);
        setSavingHoliday(false);
        return;
      }
      setHolidayDate('');
      setHolidayNote('');
      setSavingHoliday(false);
      router.refresh();
    } catch (e) {
      setHolidayError(e instanceof Error ? e.message : String(e));
      setSavingHoliday(false);
    }
  };

  const removeHoliday = async (id: string) => {
    const sb = getBrowserSupabase();
    await sb.from('holidays').delete().eq('id', id);
    router.refresh();
  };

  const addMenuItem = async () => {
    if (!menuName.trim()) {
      setMenuError('メニュー名を入力してください。');
      return;
    }
    setSavingMenu(true);
    setMenuError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('menu_items').insert({
        name: menuName.trim(),
        price: parseInt(menuPrice, 10) || 0,
        duration_minutes: parseInt(menuDuration, 10) || 60,
        sort_order: nextMenuSortOrder,
      });
      if (error) {
        setMenuError(error.message);
        setSavingMenu(false);
        return;
      }
      setMenuName('');
      setMenuPrice('');
      setMenuDuration('60');
      setSavingMenu(false);
      router.refresh();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : String(e));
      setSavingMenu(false);
    }
  };

  const removeMenuItem = async (id: string) => {
    const sb = getBrowserSupabase();
    await sb.from('menu_items').delete().eq('id', id);
    router.refresh();
  };

  return (
    <div className="page-wrap">
      <div className="inner-page">
        <div className="page-head">
          <div>
            <div className="page-h1">設定</div>
            <div className="page-sub">スタッフ管理</div>
          </div>
          <button className="btn-new" onClick={() => setNewOpen(true)}>
            <i className="ti ti-plus"></i>スタッフを追加
          </button>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>スタッフ</th><th>区分</th><th>状態</th><th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="name-link" style={{ color: 'var(--ink)', cursor: 'default' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.bg_color, color: s.fg_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                        {s.initials}
                      </div>
                      {s.name}
                    </div>
                  </td>
                  <td>{s.employment_type === 'contract' ? '業務委託' : '社員'}</td>
                  <td>
                    <span className={`tag ${s.is_active ? 'tag-ok' : 'tag-done'}`}>{s.is_active ? '在籍中' : '休止中'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-sm" onClick={() => setEditing(s)}><i className="ti ti-edit"></i>編集</button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr><td colSpan={4}><div className="empty-row">スタッフが登録されていません。</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="page-head" style={{ marginTop: 32 }}>
          <div>
            <div className="page-h1" style={{ fontSize: 22 }}>定休日</div>
            <div className="page-sub">毎週の定休日と、個別の休業日を設定できます</div>
          </div>
        </div>

        <div className="tbl-wrap" style={{ padding: 18, marginBottom: 16 }}>
          <label className="f-label">毎週の定休日（複数選択可）</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 14 }}>
            {WEEKDAY.map((w, i) => (
              <div
                key={i}
                onClick={() => toggleWeekday(i)}
                className={`staff-chip${closedWeekdays.has(i) ? ' on' : ''}`}
                style={closedWeekdays.has(i) ? { background: 'var(--red)', color: '#fff', borderColor: 'transparent' } : undefined}
              >
                {w}
              </div>
            ))}
          </div>
          <button className="btn-save" onClick={saveWeekdays} disabled={savingWeekdays}>
            {savingWeekdays ? '保存中…' : '定休日を保存する'}
          </button>
        </div>

        <div className="tbl-wrap" style={{ padding: 18 }}>
          <label className="f-label">個別の休業日（年末年始・臨時休業など）</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="f-label" style={{ fontSize: 11 }}>日付</label>
              <input className="f-input" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="f-label" style={{ fontSize: 11 }}>メモ（任意）</label>
              <input className="f-input" type="text" placeholder="年末年始休業" value={holidayNote} onChange={(e) => setHolidayNote(e.target.value)} />
            </div>
            <button className="btn-save" onClick={addHoliday} disabled={savingHoliday}>
              {savingHoliday ? '追加中…' : '追加する'}
            </button>
          </div>
          {holidayError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{holidayError}</div>}

          {holidays.length === 0 ? (
            <div className="empty-row">個別の休業日はまだ登録されていません。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {holidays.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--sand)' }}>
                  <div style={{ fontSize: 13, minWidth: 160 }}>{formatDateLong(h.holiday_date)}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-l)', flex: 1 }}>{h.note ?? ''}</div>
                  <button className="btn-sm" onClick={() => removeHoliday(h.id)}><i className="ti ti-x"></i>削除</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-head" style={{ marginTop: 32 }}>
          <div>
            <div className="page-h1" style={{ fontSize: 22 }}>施術メニュー</div>
            <div className="page-sub">予約・カルテ登録時に選べるメニューと基本料金を管理できます</div>
          </div>
        </div>

        <div className="tbl-wrap" style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="f-label" style={{ fontSize: 11 }}>メニュー名</label>
              <input className="f-input" type="text" placeholder="カット" value={menuName} onChange={(e) => setMenuName(e.target.value)} />
            </div>
            <div>
              <label className="f-label" style={{ fontSize: 11 }}>金額 (円)</label>
              <input className="f-input" type="number" min="0" placeholder="5500" value={menuPrice} onChange={(e) => setMenuPrice(e.target.value)} />
            </div>
            <div>
              <label className="f-label" style={{ fontSize: 11 }}>所要時間 (分)</label>
              <input className="f-input" type="number" min="0" step="10" placeholder="60" value={menuDuration} onChange={(e) => setMenuDuration(e.target.value)} />
            </div>
            <button className="btn-save" onClick={addMenuItem} disabled={savingMenu}>
              {savingMenu ? '追加中…' : '追加する'}
            </button>
          </div>
          {menuError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{menuError}</div>}

          {menuItems.length === 0 ? (
            <div className="empty-row">施術メニューがまだ登録されていません。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {menuItems.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--sand)' }}>
                  <div style={{ fontSize: 13, flex: 1 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-l)', minWidth: 50, textAlign: 'right' }}>{m.duration_minutes}分</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-l)', minWidth: 80, textAlign: 'right' }}>{yen(m.price)}</div>
                  <button className="btn-sm" onClick={() => removeMenuItem(m.id)}><i className="ti ti-x"></i>削除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <NewStaffModal open={newOpen} onClose={() => setNewOpen(false)} nextSortOrder={nextSortOrder} />
      {editing && (
        <EditStaffModal open={!!editing} onClose={() => setEditing(null)} staffMember={editing} />
      )}
    </div>
  );
}
