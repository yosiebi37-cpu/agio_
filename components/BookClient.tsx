'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { yen, toISODate, toMinutes, minutesToHHMM, hhmm, formatDateLong, initialsFromName } from '@/lib/format';
import type { MenuItem, Staff } from '@/lib/types';

interface Props {
  menuItems: MenuItem[];
  staff: Staff[];
}

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 20 * 60;
const SLOT_STEP = 30;

export default function BookClient({ menuItems, staff }: Props) {
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set());
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState<{ start_time: string; end_time: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const today = toISODate(new Date());

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.from('salon_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setClosedWeekdays(new Set(data.closed_weekdays));
    });
    sb.from('holidays').select('holiday_date').then(({ data }) => {
      setHolidayDates(new Set((data ?? []).map((h: { holiday_date: string }) => h.holiday_date)));
    });
  }, []);

  useEffect(() => {
    if (!selectedStaff || !date) {
      setBusy([]);
      return;
    }
    setLoadingSlots(true);
    setSlot(null);
    const sb = getBrowserSupabase();
    sb.from('public_availability')
      .select('start_time,end_time')
      .eq('staff_id', selectedStaff.id)
      .eq('booking_date', date)
      .then(({ data }) => {
        setBusy((data ?? []) as { start_time: string; end_time: string }[]);
        setLoadingSlots(false);
      });
  }, [selectedStaff, date]);

  const isClosed = date ? closedWeekdays.has(new Date(date + 'T00:00:00').getDay()) || holidayDates.has(date) : false;

  const slots = useMemo(() => {
    if (!menu || !date || isClosed) return [];
    const list: { start: string; end: string; available: boolean }[] = [];
    for (let t = OPEN_MIN; t + menu.duration_minutes <= CLOSE_MIN; t += SLOT_STEP) {
      const start = t;
      const end = t + menu.duration_minutes;
      const overlaps = busy.some((b) => toMinutes(b.start_time) < end && toMinutes(b.end_time) > start);
      list.push({ start: minutesToHHMM(start), end: minutesToHHMM(end), available: !overlaps });
    }
    return list;
  }, [menu, date, busy, isClosed]);

  const submit = async () => {
    if (!menu || !selectedStaff || !date || !slot || !name.trim() || !phone.trim()) {
      setError('お名前と電話番号を入力してください。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { data: found } = await sb.rpc('public_find_customer_by_phone', { p_phone: phone.trim() });
      let customerId: string;
      let customerType: 'existing' | 'new' = 'new';
      if (found && found.length) {
        customerId = found[0].id;
        customerType = found[0].customer_type;
      } else {
        const { data: newCustomer, error: customerError } = await sb
          .from('customers')
          .insert({
            name: name.trim(),
            phone: phone.trim(),
            initials: initialsFromName(name),
            customer_type: 'new',
          })
          .select('id')
          .single();
        if (customerError || !newCustomer) {
          setError(customerError?.message ?? '登録に失敗しました。');
          setSubmitting(false);
          return;
        }
        customerId = newCustomer.id;
      }
      const endMin = toMinutes(slot) + menu.duration_minutes;
      const { error: bookingError } = await sb.from('bookings').insert({
        customer_id: customerId,
        customer_name: name.trim(),
        staff_id: selectedStaff.id,
        booking_date: date,
        start_time: `${slot}:00`,
        end_time: `${minutesToHHMM(endMin)}:00`,
        menu: menu.name,
        status: 'confirmed',
        customer_type: customerType,
        amount: menu.price,
      });
      if (bookingError) {
        setError(bookingError.message);
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="page-wrap">
        <div className="inner-page" style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="login-title" style={{ textAlign: 'center', marginTop: 40 }}>agio</div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 16 }}>
            ご予約ありがとうございます!
          </div>
          <div style={{ textAlign: 'center', marginTop: 12, color: 'var(--ink-l)', fontSize: 14 }}>
            {formatDateLong(date)} {hhmm(slot ?? '')}〜<br />
            {selectedStaff?.name} / {menu?.name}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="inner-page" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="login-title" style={{ textAlign: 'center', marginTop: 24 }}>agio</div>
        <div className="login-sub" style={{ textAlign: 'center', marginBottom: 32 }}>ご予約はこちらから</div>

        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>① メニューを選ぶ</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {menuItems.map((m) => (
            <div
              key={m.id}
              className={`staff-chip${menu?.id === m.id ? ' on' : ''}`}
              style={menu?.id === m.id ? { background: 'var(--accent)', color: '#fff' } : undefined}
              onClick={() => { setMenu(m); setSlot(null); }}
            >
              {m.name}（{yen(m.price)} / {m.duration_minutes}分）
            </div>
          ))}
        </div>

        {menu && (
          <>
            <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>② スタッフを選ぶ</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
              {staff.map((s) => (
                <div
                  key={s.id}
                  className={`staff-chip${selectedStaff?.id === s.id ? ' on' : ''}`}
                  style={selectedStaff?.id === s.id ? { background: 'var(--accent)', color: '#fff' } : undefined}
                  onClick={() => { setSelectedStaff(s); setDate(''); setSlot(null); }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: s.bg_color, color: s.fg_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>
                    {s.initials}
                  </div>
                  {s.name}
                </div>
              ))}
              {staff.length === 0 && <div className="empty-row">選べるスタッフがいません。</div>}
            </div>
          </>
        )}

        {menu && selectedStaff && (
          <>
            <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>③ 日時を選ぶ</div>
            <input
              className="f-input"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {date && isClosed && (
              <div className="empty-row" style={{ marginBottom: 28 }}>この日は定休日です。別の日をお選びください。</div>
            )}
            {date && !isClosed && loadingSlots && (
              <div className="empty-row" style={{ marginBottom: 28 }}>空き状況を確認しています…</div>
            )}
            {date && !isClosed && !loadingSlots && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
                {slots.map((sl) => (
                  <div
                    key={sl.start}
                    className={`staff-chip${slot === sl.start ? ' on' : ''}`}
                    style={{
                      cursor: sl.available ? 'pointer' : 'default',
                      opacity: sl.available ? 1 : 0.4,
                      background: slot === sl.start ? 'var(--accent)' : undefined,
                      color: slot === sl.start ? '#fff' : undefined,
                    }}
                    onClick={() => sl.available && setSlot(sl.start)}
                  >
                    {sl.start} {sl.available ? '○' : '×'}
                  </div>
                ))}
                {slots.length === 0 && <div className="empty-row">この日は予約可能な時間がありません。</div>}
              </div>
            )}
          </>
        )}

        {slot && (
          <>
            <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 8 }}>④ お客様情報</div>
            <div className="f-row">
              <label className="f-label">お名前</label>
              <input className="f-input" type="text" placeholder="山田 花子" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="f-row" style={{ marginBottom: 0 }}>
              <label className="f-label">電話番号</label>
              <input className="f-input" type="text" placeholder="090-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--red)' }}>{error}</div>}
            <button className="btn-save login-submit" style={{ marginTop: 20 }} onClick={submit} disabled={submitting}>
              {submitting ? '予約中…' : `${formatDateLong(date)} ${hhmm(slot)}〜 で予約を確定する`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
