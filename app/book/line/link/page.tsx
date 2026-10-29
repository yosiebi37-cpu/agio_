import type { Metadata } from 'next';
import LineLinkClient from '@/components/LineLinkClient';

export const metadata: Metadata = {
  title: 'agio LINE連携',
  description: 'agio hair&spa（武蔵境）のご予約のお知らせをLINEで受け取るための連携ページです。',
  robots: { index: false },
};

// お店で受けた予約の画面に出すQRコードから開く、LINE連携のページ（LIFFの中で開く）
export default function LineLinkPage() {
  return <LineLinkClient />;
}
