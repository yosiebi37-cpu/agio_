'use client';

import { useState } from 'react';
import NewStaffModal from './NewStaffModal';
import EditStaffModal from './EditStaffModal';
import type { Staff } from '@/lib/types';

interface Props {
  staff: Staff[];
}

export default function SettingsClient({ staff }: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const nextSortOrder = staff.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;

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
      </div>
      <NewStaffModal open={newOpen} onClose={() => setNewOpen(false)} nextSortOrder={nextSortOrder} />
      {editing && (
        <EditStaffModal open={!!editing} onClose={() => setEditing(null)} staffMember={editing} />
      )}
    </div>
  );
}
