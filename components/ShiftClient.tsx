'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, formatDateTiny, hhmm, toISODate } from '@/lib/format';
import ShiftEditModal from './ShiftEditModal';
import ShiftBulkModal from './ShiftBulkModal';
import type { Staff, Shift } from '@/lib/types';

interface Props {
  staff: Staff[];
  shifts: Shift[];
  weekStart: string;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function ShiftClient({ staff, shifts, weekStart }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ staffId: string; staffName: string; date: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = toISODate(new Date());

  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of shifts) map.set(`${s.staff_id}|${s.shift_date}`, s);
    return map;
  }, [shifts]);

  const shiftWeek = (delta: number) => {
    router.push(`/shifts?date=${addDays(weekStart, delta * 7)}`);
  };

  const editingShift = editing ? shiftMap.get(`${editing.staffId}|${editing.date}`) ?? null : null;

  return (
    <div className="page-wrap">
      <div className="board-controls">
        <div className="cal-nav-row">
          <div className="cal-arrow" onClick={() => shiftWeek(-1)}><i className="ti ti-chevron-left"></i></div>
          <div className="cal-today">{formatDateTiny(weekStart)} 〜 {formatDateTiny(addDays(weekStart, 6))}</div>
          <div className="cal-arrow" onClick={() => shiftWeek(1)}><i className="ti ti-chevron-right"></i></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-l)' }}>セルをクリックしてシフトを設定・変更できます</div>
        <button className="btn-new" style={{ marginLeft: 'auto' }} onClick={() => setBulkOpen(true)}>
          <i className="ti ti-calendar-repeat"></i>曜日でまとめて設定
        </button>
      </div>

      <div className="board-scroll">
        <div className="board-grid">
          <div className="board-head-row">
            <div className="board-corner">スタッフ</div>
            {days.map((d) => (
              <div
                key={d}
                className="time-col-head"
                style={{ flexDirection: 'column', gap: 2, color: d === today ? 'var(--accent)' : undefined, fontWeight: d === today ? 600 : undefined }}
              >
                <span>{WEEKDAY[new Date(d + 'T00:00:00').getDay()]}</span>
                <span style={{ fontSize: 11 }}>{formatDateTiny(d).split('(')[0]}</span>
              </div>
            ))}
          </div>

          <div className="board-body">
            {staff.map((s) => (
              <div className="staff-row" key={s.id}>
                <div className="staff-row-head">
                  <div className="sh-avatar" style={{ background: s.bg_color, color: s.fg_color }}>{s.initials}</div>
                  <div className="sh-name">{s.name}</div>
                </div>
                {days.map((d) => {
                  const shift = shiftMap.get(`${s.id}|${d}`);
                  return (
                    <div
                      key={d}
                      className="day-cell"
                      onClick={() => setEditing({ staffId: s.id, staffName: s.name, date: d })}
                    >
                      {shift ? (
                        <div className="day-cell-count">{hhmm(shift.start_time)}〜{hhmm(shift.end_time)}</div>
                      ) : (
                        <div className="day-cell-empty">休み</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {staff.length === 0 && (
              <div className="empty-row">スタッフが登録されていません。</div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <ShiftEditModal
          open={!!editing}
          onClose={() => setEditing(null)}
          staffId={editing.staffId}
          staffName={editing.staffName}
          date={editing.date}
          existingShift={editingShift}
        />
      )}
      <ShiftBulkModal open={bulkOpen} onClose={() => setBulkOpen(false)} staff={staff} />
    </div>
  );
}
