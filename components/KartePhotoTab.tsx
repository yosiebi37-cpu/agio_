'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate } from '@/lib/format';
import type { KartePhoto } from '@/lib/types';

const BUCKET = 'karte-photos';

interface Props {
  customerId: string;
  photos: KartePhoto[];
}

export default function KartePhotoTab({ customerId, photos }: Props) {
  const router = useRouter();
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = (path: string) => {
    const sb = getBrowserSupabase();
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const upload = async (file: File, kind: 'before' | 'after') => {
    setUploading(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${customerId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }
      const { error: insertError } = await sb.from('karte_photos').insert({
        customer_id: customerId,
        kind,
        taken_on: toISODate(new Date()),
        storage_path: path,
      });
      if (insertError) {
        setError(insertError.message);
        setUploading(false);
        return;
      }
      setUploading(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUploading(false);
    }
  };

  const handleFile = (kind: 'before' | 'after') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) upload(file, kind);
  };

  const remove = async (photo: KartePhoto) => {
    if (!window.confirm('この写真を削除しますか？')) return;
    const sb = getBrowserSupabase();
    await sb.storage.from(BUCKET).remove([photo.storage_path]);
    await sb.from('karte_photos').delete().eq('id', photo.id);
    router.refresh();
  };

  return (
    <div className="kcard">
      <div className="kcard-head">
        <div className="kcard-title">ビフォーアフター写真</div>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
        <input ref={beforeInputRef} type="file" accept="image/*" hidden onChange={handleFile('before')} />
        <input ref={afterInputRef} type="file" accept="image/*" hidden onChange={handleFile('after')} />
        <button className="btn-sm" disabled={uploading} onClick={() => beforeInputRef.current?.click()}>
          <i className="ti ti-upload"></i>ビフォーを追加
        </button>
        <button className="btn-sm" disabled={uploading} onClick={() => afterInputRef.current?.click()}>
          <i className="ti ti-upload"></i>アフターを追加
        </button>
        {uploading && <span style={{ fontSize: 12, color: 'var(--ink-l)' }}>アップロード中…</span>}
      </div>
      {error && <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      <div style={{ padding: '0 16px 16px' }}>
        {photos.length === 0 ? (
          <div className="empty-row">写真がまだありません。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {photos.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <img
                  src={publicUrl(p.storage_path)}
                  alt={p.kind ?? '写真'}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--sand-d)', display: 'block' }}
                />
                {p.kind && (
                  <span
                    className={`tag ${p.kind === 'before' ? 'tag-done' : 'tag-ok'}`}
                    style={{ position: 'absolute', top: 6, left: 6 }}
                  >
                    {p.kind === 'before' ? 'ビフォー' : 'アフター'}
                  </span>
                )}
                <button
                  onClick={() => remove(p)}
                  title="削除"
                  style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(26,22,18,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }}></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
