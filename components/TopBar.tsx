'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import NewBookingModal from './NewBookingModal';
import { formatDateLong, toISODate } from '@/lib/format';

const NAV = [
  { href: '/board', label: '予約ボード', icon: 'ti-calendar-event' },
  { href: '/customers', label: '顧客管理', icon: 'ti-users' },
  { href: '/freelance', label: '業務委託', icon: 'ti-receipt' },
  { href: '/sales', label: '売上', icon: 'ti-chart-bar' },
];

export default function TopBar() {
  const pathname = usePathname();
  const [today, setToday] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setToday(formatDateLong(toISODate(new Date())));
  }, []);

  const isActive = (href: string) => {
    if (href === '/board') return pathname === '/' || pathname.startsWith('/board');
    if (href === '/customers') return pathname.startsWith('/customers') || pathname.startsWith('/karte');
    return pathname.startsWith(href);
  };

  return (
    <>
      <div className="topbar">
        <div className="logo">Atelier</div>
        <div className="top-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`tnav${isActive(n.href) ? ' active' : ''}`}>
              <i className={`ti ${n.icon}`}></i>
              {n.label}
            </Link>
          ))}
          <span className="tnav"><i className="ti ti-settings"></i>設定</span>
        </div>
        <div className="top-right">
          <div className="date-badge">{today}</div>
          <div className="tbtn"><i className="ti ti-bell"></i></div>
          <button className="btn-new" onClick={() => setModalOpen(true)}>
            <i className="ti ti-plus"></i>新規予約
          </button>
        </div>
      </div>
      <NewBookingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
