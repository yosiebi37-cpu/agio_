import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'agio 予約管理',
    short_name: 'agio',
    description: '美容室向けの予約・顧客・カルテ・シフト・報酬管理',
    start_url: '/board',
    display: 'standalone',
    background_color: '#FAF7F2',
    theme_color: '#2A2724',
    lang: 'ja',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
