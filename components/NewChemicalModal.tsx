'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate } from '@/lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string;
}

export default function NewChemicalModal({ open, onClose, customerId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recordOn, setRecordOn] = useState(() => toISODate(new Date()));
  const [typeLabel, setTypeLabel] = useState('');
  const [brand, setBrand] = useState('');
  const [colorCode, setColorCode] = useState('');
  const [oxy, setOxy] = useState('');
  const [processingTime, setProcessingTime] = useState('');
  const [finishNote, setFinishNote] = useState('');
  const [patchTest, setPatchTest] = useState(false);

  if (!open) return null;

  const reset = () => {
    setRecordOn(toISODate(new Date()));
    setTypeLabel('');
    setBrand('');
    setColorCode('');
    setOxy('');
    setProcessingTime('');
    setFinishNote('');
    setPatchTest(false);
  };

  const submit = async () => {
    if (!typeLabel.trim()) {
      setError('種別（例: ハイライトカラー）を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('chemical_records').insert({
        customer_id: customerId,
        record_on: recordOn,
        type_label: typeLabel.trim(),
        brand: brand.trim() || null,
        color_code: colorCode.trim() || null,
        oxy: oxy.trim() || null,
        processing_time: processingTime.trim() || null,
        finish_note: finishNote.trim() || null,
        patch_test: patchTest,
      });
      if (error) {
        setError(error.message);
        setSaving(false);
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
          <div className="modal-title">薬剤・カラー記録を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">記録日</label>
              <input className="f-input" type="date" value={recordOn} onChange={(e) => setRecordOn(e.target.value)} />
            </div>
            <div>
              <label className="f-label">種別</label>
              <input className="f-input" type="text" placeholder="ハイライトカラー" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} />
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">ブランド</label>
              <input className="f-input" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div>
              <label className="f-label">色番</label>
              <input className="f-input" type="text" value={colorCode} onChange={(e) => setColorCode(e.target.value)} />
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">オキシ</label>
              <input className="f-input" type="text" placeholder="6%" value={oxy} onChange={(e) => setOxy(e.target.value)} />
            </div>
            <div>
              <label className="f-label">放置時間</label>
              <input className="f-input" type="text" placeholder="25分" value={processingTime} onChange={(e) => setProcessingTime(e.target.value)} />
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">仕上がりメモ</label>
            <input className="f-input" type="text" value={finishNote} onChange={(e) => setFinishNote(e.target.value)} />
          </div>
          <label className="f-check" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={patchTest} onChange={(e) => setPatchTest(e.target.checked)} />
            パッチテスト実施済み
          </label>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
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
