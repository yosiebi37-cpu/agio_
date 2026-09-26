// ホーム画面に追加した時に「アプリらしく」開けるようにするための最小限のservice worker。
// データはキャッシュせず、常にネットワークから取得する（予約状況などが古くならないように）。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
