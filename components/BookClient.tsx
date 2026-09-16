'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { yen, toISODate, addDays, toMinutes, minutesToHHMM, hhmm, formatDateLong, formatDateTiny, initialsFromName } from '@/lib/format';
import type { MenuItem, PublicStaff } from '@/lib/types';

interface Props {
  menuItems: MenuItem[];
  staff: PublicStaff[];
}

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 20 * 60;
const SLOT_STEP = 30;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

type Step = 'menu' | 'staff' | 'datetime' | 'contact' | 'done';

export default function BookClient({ menuItems, staff }: Props) {
  const today = toISODate(new Date());

  const [step, setStep] = useState<Step>('menu');
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set());
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<PublicStaff | null>(null);
  const [weekStart, setWeekStart] = useState(today);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<{ start_time: string; end_time: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [searchingNext, setSearchingNext] = useState(false);

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const isClosed = (d: string) => closedWeekdays.has(new Date(d + 'T00:00:00').getDay()) || holidayDates.has(d);

  const computeSlots = (busyList: { start_time: string; end_time: string }[]) => {
    if (!menu) return [];
    const list: { start: string; available: boolean }[] = [];
    for (let t = OPEN_MIN; t + menu.duration_minutes <= CLOSE_MIN; t += SLOT_STEP) {
      const end = t + menu.duration_minutes;
      const overlaps = busyList.some((b) => toMinutes(b.start_time) < end && toMinutes(b.end_time) > t);
      list.push({ start: minutesToHHMM(t), available: !overlaps });
    }
    return list;
  };

  const slots = useMemo(() => (date && !isClosed(date) ? computeSlots(busy) : []), [menu, date, busy, closedWeekdays, holidayDates]);
  const availableSlots = slots.filter((s) => s.available);
  const slotGroups = [
    { label: '午前', items: availableSlots.filter((s) => toMinutes(s.start) < 12 * 60) },
    { label: '午後', items: availableSlots.filter((s) => toMinutes(s.start) >= 12 * 60 && toMinutes(s.start) < 18 * 60) },
    { label: '夜間', items: availableSlots.filter((s) => toMinutes(s.start) >= 18 * 60) },
  ];

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const findNextAvailable = async () => {
    if (!menu || !selectedStaff) return;
    setSearchingNext(true);
    setError(null);
    const sb = getBrowserSupabase();
    let d = date;
    for (let i = 0; i < 60; i++) {
      d = addDays(d, 1);
      if (isClosed(d)) continue;
      const { data } = await sb
        .from('public_availability')
        .select('start_time,end_time')
        .eq('staff_id', selectedStaff.id)
        .eq('booking_date', d);
      const busyList = (data ?? []) as { start_time: string; end_time: string }[];
      const found = computeSlots(busyList).some((s) => s.available);
      if (found) {
        setWeekStart(d);
        setDate(d);
        setSearchingNext(false);
        return;
      }
    }
    setSearchingNext(false);
    setError('しばらく空きが見つかりませんでした。お手数ですがお電話でお問い合わせください。');
  };

  const submit = async () => {
    const name = `${lastName.trim()} ${firstName.trim()}`.trim();
    if (!menu || !selectedStaff || !date || !slot || !name || !phone.trim()) {
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
        const { data: newCustomerId, error: customerError } = await sb.rpc('public_create_customer', {
          p_name: name,
          p_phone: phone.trim(),
          p_initials: initialsFromName(name),
        });
        if (customerError || !newCustomerId) {
          setError(customerError?.message ?? '登録に失敗しました。');
          setSubmitting(false);
          return;
        }
        customerId = newCustomerId;
      }
      const endMin = toMinutes(slot) + menu.duration_minutes;
      const { error: bookingError } = await sb.from('bookings').insert({
        customer_id: customerId,
        customer_name: name,
        staff_id: selectedStaff.id,
        booking_date: date,
        start_time: `${slot}:00`,
        end_time: `${minutesToHHMM(endMin)}:00`,
        menu: menu.name,
        status: 'confirmed',
        customer_type: customerType,
        amount: menu.price,
        note: memo.trim() || null,
      });
      if (bookingError) {
        setError(bookingError.message);
        setSubmitting(false);
        return;
      }
      setStep('done');
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const BackLink = ({ to }: { to: Step }) => (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--ink-l)', cursor: 'pointer', marginBottom: 20 }}
      onClick={() => setStep(to)}
    >
      <i className="ti ti-arrow-left"></i>戻る
    </div>
  );

  const SummaryCard = () => (
    <div style={{ border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 24, background: '#FAFAF8' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink-l)', marginBottom: 10 }}>予約のサマリー</div>
      {menu && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: selectedStaff || date ? 8 : 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{menu.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 14 }}>{yen(menu.price)}</div>
            <i className="ti ti-pencil" style={{ fontSize: 14, color: 'var(--ink-l)', cursor: 'pointer' }} onClick={() => setStep('menu')}></i>
          </div>
        </div>
      )}
      {selectedStaff && <div style={{ fontSize: 13, color: 'var(--ink-l)', marginBottom: slot ? 4 : 0 }}>担当: {selectedStaff.name}</div>}
      {step !== 'datetime' && slot && <div style={{ fontSize: 13, color: 'var(--ink-l)' }}>{formatDateLong(date)} {hhmm(slot)}〜</div>}
    </div>
  );

  if (step === 'done') {
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

        {step === 'menu' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>メニューを選択</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {menuItems.map((m) => (
                <div
                  key={m.id}
                  onClick={() => { setMenu(m); setSlot(null); setStep('staff'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 4px', borderBottom: '1px solid var(--sand)', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-l)' }}>{m.duration_minutes >= 60 ? `${Math.floor(m.duration_minutes / 60)}時間${m.duration_minutes % 60 ? m.duration_minutes % 60 + '分' : ''}` : `${m.duration_minutes}分`}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{yen(m.price)}</div>
                </div>
              ))}
              {menuItems.length === 0 && <div className="empty-row">現在ご予約いただけるメニューがありません。</div>}
            </div>
          </>
        )}

        {step === 'staff' && (
          <>
            <BackLink to="menu" />
            <SummaryCard />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>スタッフを選択</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 24 }}>
              {staff.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStaff(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', borderBottom: '1px solid var(--sand)', cursor: 'pointer' }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selectedStaff?.id === s.id ? 'var(--accent)' : 'var(--sand)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {selectedStaff?.id === s.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }}></div>}
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.bg_color, color: s.fg_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                    {s.initials}
                  </div>
                  <div style={{ fontSize: 14 }}>{s.name}</div>
                </div>
              ))}
              {staff.length === 0 && <div className="empty-row">選べるスタッフがいません。</div>}
            </div>
            <button className="btn-save login-submit" disabled={!selectedStaff} onClick={() => setStep('datetime')}>次へ</button>
          </>
        )}

        {step === 'datetime' && (
          <>
            <BackLink to="staff" />
            <SummaryCard />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>日時を選択</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <i
                className="ti ti-chevron-left"
                style={{ fontSize: 18, cursor: weekStart > today ? 'pointer' : 'default', opacity: weekStart > today ? 1 : 0.3 }}
                onClick={() => weekStart > today && setWeekStart(addDays(weekStart, -7))}
              ></i>
              <div style={{ fontSize: 13, color: 'var(--ink-l)' }}>{new Date(weekStart + 'T00:00:00').getFullYear()}年{new Date(weekStart + 'T00:00:00').getMonth() + 1}月</div>
              <i className="ti ti-chevron-right" style={{ fontSize: 18, cursor: 'pointer' }} onClick={() => setWeekStart(addDays(weekStart, 7))}></i>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
              {weekDays.map((d) => {
                const past = d < today;
                const closed = isClosed(d);
                const disabled = past;
                const dObj = new Date(d + 'T00:00:00');
                return (
                  <div
                    key={d}
                    onClick={() => !disabled && setDate(d)}
                    style={{
                      textAlign: 'center', padding: '8px 2px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
                      background: date === d ? 'var(--ink)' : 'transparent',
                      color: date === d ? '#fff' : disabled ? 'var(--ink-l)' : closed ? 'var(--red)' : 'var(--ink)',
                      opacity: disabled ? 0.4 : 1,
                      textDecoration: past ? 'line-through' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 11 }}>{WEEKDAY[dObj.getDay()]}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{dObj.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {isClosed(date) && (
              <div className="empty-row" style={{ marginBottom: 20 }}>この日は定休日です。別の日をお選びください。</div>
            )}
            {!isClosed(date) && loadingSlots && (
              <div className="empty-row" style={{ marginBottom: 20 }}>空き状況を確認しています…</div>
            )}
            {!isClosed(date) && !loadingSlots && availableSlots.length === 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="empty-row" style={{ marginBottom: 12 }}>{formatDateLong(date)}に予約可能な時間はありません。</div>
                <button className="btn-cancel" onClick={findNextAvailable} disabled={searchingNext}>
                  {searchingNext ? '検索中…' : '次の空き日をさがす'}
                </button>
              </div>
            )}
            {!isClosed(date) && !loadingSlots && availableSlots.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{formatDateTiny(date)}</div>
                {slotGroups.map((g) => g.items.length > 0 && (
                  <div key={g.label} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-l)', marginBottom: 6 }}>{g.label}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {g.items.map((sl) => (
                        <div
                          key={sl.start}
                          onClick={() => setSlot(sl.start)}
                          style={{
                            padding: '8px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                            background: slot === sl.start ? 'var(--ink)' : 'var(--sand)',
                            color: slot === sl.start ? '#fff' : 'var(--ink)',
                          }}
                        >
                          {sl.start}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>{error}</div>}
            <button className="btn-save login-submit" disabled={!slot} onClick={() => setStep('contact')}>次へ</button>
          </>
        )}

        {step === 'contact' && (
          <>
            <BackLink to="datetime" />
            <SummaryCard />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>お客様情報</div>
            <div className="f-row2">
              <div>
                <label className="f-label">姓</label>
                <input className="f-input" type="text" placeholder="山田" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <label className="f-label">名</label>
                <input className="f-input" type="text" placeholder="花子" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
            </div>
            <div className="f-row">
              <label className="f-label">電話番号</label>
              <input className="f-input" type="text" placeholder="090-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="f-row" style={{ marginBottom: 0 }}>
              <label className="f-label">予約に関するメモ（任意）</label>
              <textarea className="f-input f-textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--red)' }}>{error}</div>}
            <button className="btn-save login-submit" style={{ marginTop: 20 }} onClick={submit} disabled={submitting}>
              {submitting ? '予約中…' : '予約する'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
