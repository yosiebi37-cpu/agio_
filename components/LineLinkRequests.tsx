'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizePhone } from '@/lib/customer-match';
import { hiraganaToKatakana } from '@/lib/format';
import type { CustomerWithStaff } from '@/lib/types';

export interface LineLinkRequest {
  id: string;
  line_user_id: string;
  line_display_name: string | null;
  name: string;
  furigana: string | null;
  phone: string;
  suggested_customer_id: string | null;
  created_at: string;
}

interface Props {
  requests: LineLinkRequest[];
  customers: CustomerWithStaff[];
}

/**
 * 顧客管理画面の上に出す「LINE連携の申請」一覧。
 * お客様がLINEの予約確認ページから送った申請を見て、どのお客様か確かめて承認（または却下）する。
 */
export default function LineLinkRequests({ requests, customers }: Props) {
  if (requests.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--gold-d)', borderRadius: 12, padding: 16, marginBottom: 16, background: '#FAFAF8' }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>LINE連携の申請 {requests.length}件</div>
      <div style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.7 }}>
        お客様がLINEの「予約確認」から申請しています。どのお客様か確かめて「承認して連携」を押すと、LINEとつながり、前日のLINEリマインドが届くようになります。
      </div>
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} customers={customers} />
      ))}
    </div>
  );
}

function RequestRow({ req, customers }: { req: LineLinkRequest; customers: CustomerWithStaff[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(req.suggested_customer_id ?? '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqPhone = normalizePhone(req.phone);

  // 候補（自動で見つけた人・電話番号が同じ人）を先頭に並べ、検索で絞り込めるようにする
  const options = useMemo(() => {
    const kw = q.trim();
    const kwKana = hiraganaToKatakana(kw);
    const list = customers.filter(
      (c) => !kw || c.name.includes(kw) || (c.furigana ?? '').includes(kwKana) || (c.phone ?? '').includes(kw),
    );
    const score = (c: CustomerWithStaff) =>
      (c.id === req.suggested_customer_id ? 4 : 0) + (reqPhone.length >= 10 && normalizePhone(c.phone) === reqPhone ? 2 : 0);
    const sorted = [...list].sort((a, b) => score(b) - score(a)).slice(0, 60);
    const selected = customers.find((c) => c.id === customerId);
    if (selected && !sorted.some((c) => c.id === selected.id)) sorted.unshift(selected);
    return sorted;
  }, [customers, q, req.suggested_customer_id, reqPhone, customerId]);

  const selected = customers.find((c) => c.id === customerId);

  const review = async (action: 'approve' | 'reject') => {
    if (action === 'approve' && !customerId) {
      setError('どのお客様か選んでください。');
      return;
    }
    if (action === 'reject' && !window.confirm('この申請を却下しますか？\nお客様のLINEに「確認できませんでした」とお知らせが届きます。')) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/link-request-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: req.id, action, customerId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? '処理に失敗しました。');
      return;
    }
    router.refresh();
  };

  const requestedAt = new Date(req.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ borderTop: '1px solid var(--sand)', paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontSize: 14 }}>
        <span style={{ fontWeight: 600 }}>{req.name}</span>
        {req.furigana && <span style={{ color: 'var(--ink-l)' }}>（{req.furigana}）</span>} ／ {req.phone}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 2 }}>
        LINEの名前：{req.line_display_name ?? '—'} ／ 申請：{requestedAt}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          style={{ flex: '1 1 160px', minWidth: 0 }}
          placeholder="お客様を検索（名前・電話）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="sel" style={{ flex: '2 1 220px', minWidth: 0 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">どのお客様か選んでください</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === req.suggested_customer_id ? '★候補 ' : ''}
              {c.name}
              {c.phone ? `（${c.phone}）` : ''}
              {c.line_user_id ? ' ※LINE連携済み' : ''}
            </option>
          ))}
        </select>
      </div>

      {!req.suggested_customer_id && (
        <div style={{ fontSize: 12, color: 'var(--gold-d)', marginTop: 6 }}>自動では候補が見つかりませんでした。検索して選んでください（新規のお客様の場合は、先に顧客登録してください）。</div>
      )}
      {selected?.line_user_id && selected.line_user_id !== req.line_user_id && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>このお客様はすでに別のLINEと連携しています。承認すると、新しいLINEに置き換わります。</div>
      )}
      {error && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 6 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-save" onClick={() => review('approve')} disabled={busy || !customerId}>
          {busy ? '処理中…' : '承認して連携'}
        </button>
        <button className="btn-cancel" onClick={() => review('reject')} disabled={busy}>
          却下
        </button>
      </div>
    </div>
  );
}
