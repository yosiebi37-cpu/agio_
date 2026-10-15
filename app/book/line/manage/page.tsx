import type { Metadata } from 'next';
import ManageBookingClient from '@/components/ManageBookingClient';

export const metadata: Metadata = {
  title: 'agio ご予約の確認・変更',
  description: 'agio hair&spa（武蔵境）のご予約の確認・日時の変更・キャンセルはこちらから。',
  robots: { index: false },
};

// LINEの中（LIFF）から開く、お客様ご自身による予約の確認・変更・キャンセルのページ
export default function ManageBookingPage() {
  return <ManageBookingClient />;
}
