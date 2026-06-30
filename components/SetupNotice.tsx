export default function SetupNotice() {
  return (
    <div className="inner-page">
      <div className="setup-note">
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔌</div>
        <h2 style={{ marginBottom: 16 }}>Supabase に接続してください</h2>

        <div className="setup-step">
          <div className="setup-step-num">1</div>
          <div>
            <strong>Supabase でプロジェクトを作成</strong>
            <p>supabase.com → 新規プロジェクト作成</p>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">2</div>
          <div>
            <strong>テーブルを作成</strong>
            <p>SQL Editor で以下を順に実行：</p>
            <code className="setup-code">supabase/schema.sql</code>
            <code className="setup-code" style={{ marginTop: 4 }}>supabase/seed.sql</code>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">3</div>
          <div>
            <strong>APIキーを取得</strong>
            <p>Project Settings → API → Project URL と anon public key をコピー</p>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">4</div>
          <div>
            <strong>環境変数を設定</strong>
            <p>プロジェクトルートの <code>.env.local</code> を編集：</p>
            <div className="setup-env">
              <div><span style={{ color: '#7B9E87' }}>NEXT_PUBLIC_SUPABASE_URL</span>=https://xxxx.supabase.co</div>
              <div><span style={{ color: '#7B9E87' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>=eyJhbGci...</div>
            </div>
          </div>
        </div>

        <div className="setup-step" style={{ border: 'none' }}>
          <div className="setup-step-num">5</div>
          <div>
            <strong>サーバーを再起動</strong>
            <p><code>npm run dev</code> を再実行してページをリロード</p>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: '10px 14px', background: '#FFF8F0', borderRadius: 8, fontSize: 12, color: '#8A6A1A', borderLeft: '3px solid #C9A84C' }}>
          Vercel にデプロイする場合は Project Settings → Environment Variables に同じキーを登録してください。
        </div>
      </div>
    </div>
  );
}
