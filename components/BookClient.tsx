'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { yen, toISODate, addDays, toMinutes, minutesToHHMM, hhmm, formatDateLong, formatDateTiny } from '@/lib/format';
import { useFuriganaAutofill } from '@/lib/useFuriganaAutofill';
import { MENU_CATEGORIES, OTHER_MENU_CATEGORY } from '@/lib/constants';
import type { MenuItem, PublicStaff } from '@/lib/types';

/** 全角数字・記号を半角に正規化する（電話番号欄向け） */
const toHalfWidth = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー―]/g, '-');

interface Props {
  menuItems: MenuItem[];
  staff: PublicStaff[];
  /** LINE内（/book/line）で開かれた場合はtrue。予約前日リマインダー用に、LINEのユーザーIDを裏側で取得する。 */
  useLiff?: boolean;
}

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 20 * 60;
const SLOT_STEP = 30;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

type Step = 'menu' | 'staff' | 'datetime' | 'contact' | 'done';

export default function BookClient({ menuItems, staff, useLiff }: Props) {
  const today = toISODate(new Date());
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('menu');
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set());
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuItem | null>(null);
  const menuCategories = useMemo(() => {
    const present = new Set(menuItems.map((m) => m.category ?? OTHER_MENU_CATEGORY));
    const ordered = MENU_CATEGORIES.filter((c) => present.has(c));
    if (present.has(OTHER_MENU_CATEGORY)) ordered.push(OTHER_MENU_CATEGORY);
    return ordered;
  }, [menuItems]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const activeCategory = selectedCategory ?? menuCategories[0] ?? null;
  const visibleMenuItems = activeCategory
    ? menuItems.filter((m) => (m.category ?? OTHER_MENU_CATEGORY) === activeCategory)
    : menuItems;
  const [selectedStaff, setSelectedStaff] = useState<PublicStaff | null>(null);
  const [weekStart, setWeekStart] = useState(today);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<{ start_time: string; end_time: string }[]>([]);
  const [shift, setShift] = useState<{ start_time: string; end_time: string } | null>(null);
  const [allBookings, setAllBookings] = useState<{ start_time: string; end_time: string }[]>([]);
  const [capacityMap, setCapacityMap] = useState<Map<number, number>>(new Map());
  const [allShifts, setAllShifts] = useState<{ staff_id: string; start_time: string; end_time: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [searchingNext, setSearchingNext] = useState(false);

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const lastNameFurigana = useFuriganaAutofill();
  const firstNameFurigana = useFuriganaAutofill();
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  );

  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const phoneError = phoneTouched && phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 11)
    ? '電話番号は10〜11桁の数字で入力してください（ハイフンはあってもなくても大丈夫です）'
    : null;

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.from('salon_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setClosedWeekdays(new Set(data.closed_weekdays));
    });
    sb.from('holidays').select('holiday_date').then(({ data }) => {
      setHolidayDates(new Set((data ?? []).map((h: { holiday_date: string }) => h.holiday_date)));
    });
  }, []);

  // LINE内で開かれた場合、画面には何も表示せず裏側でLINEユーザーIDだけ取得する（予約前日リマインダー用）
  useEffect(() => {
    if (!useLiff) return;
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return;
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        }
      } catch {
        // LIFFの初期化・ログインに失敗しても予約自体は通常通り続行する
      }
    })();
  }, [useLiff]);

  // 「フリー」は担当未定の予約を仮に割り当てるためのダミー枠で、実際に施術できる人員ではないため、
  // 受付可能数の自動計算からは除く
  const freeStaffIds = useMemo(() => new Set(staff.filter((s) => s.name === 'フリー').map((s) => s.id)), [staff]);

  // [bStart, bEnd) の30分枠に実際にシフトが入っているスタッフの人数（「フリー」を除く）を数える。
  // 誰もシフトに入っていない時間は0になる（＝その時間はどのスタッフも選べず、実際に予約もできない）。
  const shiftBookableCount = (
    bStart: number,
    bEnd: number,
    shiftsList: { staff_id: string; start_time: string; end_time: string }[],
  ) => {
    const workingIds = new Set(
      shiftsList
        .filter((sh) => !freeStaffIds.has(sh.staff_id) && toMinutes(sh.start_time) <= bStart && toMinutes(sh.end_time) >= bEnd)
        .map((sh) => sh.staff_id),
    );
    return workingIds.size;
  };

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!selectedStaff || !date) {
      setBusy([]);
      setShift(null);
      return;
    }
    setLoadingSlots(true);
    setSlot(null);
    const sb = getBrowserSupabase();
    Promise.all([
      sb.from('public_availability').select('start_time,end_time').eq('staff_id', selectedStaff.id).eq('booking_date', date),
      sb.from('public_shifts').select('start_time,end_time').eq('staff_id', selectedStaff.id).eq('shift_date', date).maybeSingle(),
    ]).then(([availRes, shiftRes]) => {
      setBusy((availRes.data ?? []) as { start_time: string; end_time: string }[]);
      setShift((shiftRes.data as { start_time: string; end_time: string } | null) ?? null);
      setLoadingSlots(false);
    });
  }, [selectedStaff, date, refreshTick]);

  // 時間帯ごとの受付可能数（スタッフ全員分の合計）は、特定のスタイリストの空き状況とは別に、
  // お店全体で「この時間はもう受け付けられない」という上限をチェックするために使う
  useEffect(() => {
    if (!date) {
      setAllBookings([]);
      setCapacityMap(new Map());
      setAllShifts([]);
      return;
    }
    const sb = getBrowserSupabase();
    Promise.all([
      sb.from('public_availability').select('start_time,end_time').eq('booking_date', date),
      sb.from('public_hourly_capacity').select('hour,minute,capacity').eq('capacity_date', date),
      sb.from('public_shifts').select('staff_id,start_time,end_time').eq('shift_date', date),
    ]).then(([availRes, capRes, shiftsRes]) => {
      setAllBookings((availRes.data ?? []) as { start_time: string; end_time: string }[]);
      const map = new Map<number, number>();
      for (const c of (capRes.data ?? []) as { hour: number; minute: number; capacity: number }[]) map.set(c.hour * 60 + c.minute, c.capacity);
      setCapacityMap(map);
      setAllShifts((shiftsRes.data ?? []) as { staff_id: string; start_time: string; end_time: string }[]);
    });
  }, [date, refreshTick]);

  const isClosed = (d: string) => closedWeekdays.has(new Date(d + 'T00:00:00').getDay()) || holidayDates.has(d);

  // [t, end) の間にかかる30分枠すべてで、お店全体の受付可能数に空きがあるかを確認する
  const hourCapacityAvailable = (
    t: number,
    end: number,
    allBookingsList: { start_time: string; end_time: string }[],
    capMap: Map<number, number>,
    shiftsList: { staff_id: string; start_time: string; end_time: string }[],
  ) => {
    const firstBucket = Math.floor(t / 30) * 30;
    const lastBucket = Math.floor((end - 1) / 30) * 30;
    for (let bStart = firstBucket; bStart <= lastBucket; bStart += 30) {
      const bEnd = bStart + 30;
      const count = allBookingsList.filter((b) => toMinutes(b.start_time) < bEnd && toMinutes(b.end_time) > bStart).length;
      const capacity = capMap.get(bStart) ?? shiftBookableCount(bStart, bEnd, shiftsList);
      if (count >= capacity) return false;
    }
    return true;
  };

  // shiftWindow が null の場合は、そのスタッフがその日出勤していない（シフト未登録）ことを表す
  const computeSlots = (
    busyList: { start_time: string; end_time: string }[],
    shiftWindow: { start_time: string; end_time: string } | null,
    allBookingsList: { start_time: string; end_time: string }[],
    capMap: Map<number, number>,
    shiftsList: { staff_id: string; start_time: string; end_time: string }[],
  ) => {
    if (!menu || !shiftWindow) return [];
    const openMin = Math.max(OPEN_MIN, toMinutes(shiftWindow.start_time));
    const closeMin = Math.min(CLOSE_MIN, toMinutes(shiftWindow.end_time));
    const list: { start: string; available: boolean }[] = [];
    for (let t = openMin; t + menu.duration_minutes <= closeMin; t += SLOT_STEP) {
      const end = t + menu.duration_minutes;
      const staffOverlaps = busyList.some((b) => toMinutes(b.start_time) < end && toMinutes(b.end_time) > t);
      const capacityOk = hourCapacityAvailable(t, end, allBookingsList, capMap, shiftsList);
      list.push({ start: minutesToHHMM(t), available: !staffOverlaps && capacityOk });
    }
    return list;
  };

  const slots = useMemo(
    () => (date && !isClosed(date) ? computeSlots(busy, shift, allBookings, capacityMap, allShifts) : []),
    [menu, date, busy, shift, allBookings, capacityMap, allShifts, closedWeekdays, holidayDates],
  );
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
      const [availRes, shiftRes, allAvailRes, capRes, allShiftsRes] = await Promise.all([
        sb.from('public_availability').select('start_time,end_time').eq('staff_id', selectedStaff.id).eq('booking_date', d),
        sb.from('public_shifts').select('start_time,end_time').eq('staff_id', selectedStaff.id).eq('shift_date', d).maybeSingle(),
        sb.from('public_availability').select('start_time,end_time').eq('booking_date', d),
        sb.from('public_hourly_capacity').select('hour,minute,capacity').eq('capacity_date', d),
        sb.from('public_shifts').select('staff_id,start_time,end_time').eq('shift_date', d),
      ]);
      const busyList = (availRes.data ?? []) as { start_time: string; end_time: string }[];
      const shiftWindow = (shiftRes.data as { start_time: string; end_time: string } | null) ?? null;
      const allBookingsForDay = (allAvailRes.data ?? []) as { start_time: string; end_time: string }[];
      const capMapForDay = new Map<number, number>();
      for (const c of (capRes.data ?? []) as { hour: number; minute: number; capacity: number }[]) capMapForDay.set(c.hour * 60 + c.minute, c.capacity);
      const allShiftsForDay = (allShiftsRes.data ?? []) as { staff_id: string; start_time: string; end_time: string }[];
      const found = computeSlots(busyList, shiftWindow, allBookingsForDay, capMapForDay, allShiftsForDay).some((s) => s.available);
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
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/book-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          menuName: menu.name,
          menuDurationMinutes: menu.duration_minutes,
          menuPrice: menu.price,
          staffId: selectedStaff.id,
          date,
          startTime: slot,
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          furigana: `${lastNameFurigana.furigana} ${firstNameFurigana.furigana}`.trim(),
          phone: phoneDigits,
          memo,
          lineUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '予約に失敗しました。');
        setSubmitting(false);
        if (res.status === 409) {
          // 枠が埋まっていた場合は日時選択に戻し、空き状況を読み直す
          setStep('datetime');
          setSlot(null);
          setRefreshTick((t) => t + 1);
        }
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
            <div style={{ fontSize: 14 }}>{yen(menu.price)}<span style={{ fontSize: 11, color: 'var(--ink-l)' }}>（税込）</span></div>
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
            {menuCategories.length > 1 && (
              <div
                role="tablist"
                aria-label="メニューのカテゴリ"
                style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}
              >
                {menuCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === c}
                    onClick={() => setSelectedCategory(c)}
                    style={{
                      flexShrink: 0,
                      padding: '8px 16px',
                      minHeight: 40,
                      borderRadius: 20,
                      border: '1px solid var(--sand-d)',
                      background: activeCategory === c ? 'var(--accent)' : 'var(--cream)',
                      color: activeCategory === c ? '#fff' : 'var(--ink)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleMenuItems.map((m) => (
                <div
                  key={m.id}
                  onClick={() => { setMenu(m); setSlot(null); setStep('staff'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 4px', borderBottom: '1px solid var(--sand)', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-l)' }}>{m.duration_minutes >= 60 ? `${Math.floor(m.duration_minutes / 60)}時間${m.duration_minutes % 60 ? m.duration_minutes % 60 + '分' : ''}` : `${m.duration_minutes}分`}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{yen(m.price)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-l)' }}>（税込）</span></div>
                </div>
              ))}
              {visibleMenuItems.length === 0 && <div className="empty-row">現在ご予約いただけるメニューがありません。</div>}
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
                <div className="empty-row" style={{ marginBottom: 12 }}>
                  {shift
                    ? `${formatDateLong(date)}に予約可能な時間はありません。`
                    : `${formatDateLong(date)}は${selectedStaff?.name}の出勤日ではありません。`}
                </div>
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
                <label className="f-label">セイ</label>
                <input
                  className="f-input"
                  type="text"
                  placeholder="ヤマダ"
                  value={lastNameFurigana.furigana}
                  onChange={lastNameFurigana.onFuriganaChange}
                  style={{ fontSize: 16 }}
                />
              </div>
              <div>
                <label className="f-label">メイ</label>
                <input
                  className="f-input"
                  type="text"
                  placeholder="ハナコ"
                  value={firstNameFurigana.furigana}
                  onChange={firstNameFurigana.onFuriganaChange}
                  style={{ fontSize: 16 }}
                />
              </div>
            </div>
            <div className="f-row2">
              <div>
                <label className="f-label">姓</label>
                <input
                  className="f-input"
                  type="text"
                  placeholder="山田"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onCompositionUpdate={lastNameFurigana.nameCompositionHandlers.onCompositionUpdate}
                  onCompositionEnd={lastNameFurigana.nameCompositionHandlers.onCompositionEnd}
                  style={{ fontSize: 16 }}
                />
              </div>
              <div>
                <label className="f-label">名</label>
                <input
                  className="f-input"
                  type="text"
                  placeholder="花子"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onCompositionUpdate={firstNameFurigana.nameCompositionHandlers.onCompositionUpdate}
                  onCompositionEnd={firstNameFurigana.nameCompositionHandlers.onCompositionEnd}
                  style={{ fontSize: 16 }}
                />
              </div>
            </div>
            <div className="f-row">
              <label className="f-label">電話番号</label>
              <input
                className="f-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="090-1234-5678"
                value={phone}
                onChange={(e) => setPhone(toHalfWidth(e.target.value))}
                onBlur={() => setPhoneTouched(true)}
                style={{ fontSize: 16 }}
              />
              {phoneError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{phoneError}</div>}
            </div>
            <div className="f-row" style={{ marginBottom: 0 }}>
              <label className="f-label">予約に関するメモ（任意）</label>
              <textarea className="f-input f-textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} style={{ fontSize: 16 }} />
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
