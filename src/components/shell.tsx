'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  SquareCheck,
  CalendarDays,
  Bot,
  Share2,
  Folder,
  BookOpen,
  Settings,
  Headphones,
  Menu,
  Search,
  Plus,
  Bell,
  LogOut,
} from 'lucide-react';
import { Brand, Copyright, useT, api, Modal, Empty } from './ui';
import { ThemeToggle } from './theme-toggle';
const navigation = [
  ['dashboard', LayoutDashboard],
  ['contents', SquareCheck],
  ['calendar', CalendarDays],
  ['agents', Bot],
  ['channels', Share2],
  ['library', Folder],
  ['university', BookOpen],
  ['settings', Settings],
  ['support', Headphones],
] as const;
export function Shell({
  children,
  name,
  userName,
  avatarUrl,
  role,
}: {
  children: React.ReactNode;
  name: string;
  userName?: string;
  avatarUrl?: string;
  role: string;
}) {
  const router = useRouter(),
    t = useT(),
    path = usePathname(),
    params = useSearchParams(),
    [open, setOpen] = useState(false),
    [notifications, setNotifications] = useState<
      { id: string; message: string; href: string }[] | null
    >(null);
  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <Brand />
        <nav aria-label={t('dashboard')}>
          {navigation.map(([key, Icon]) => (
            <Link
              onClick={() => setOpen(false)}
              key={key}
              href={`/${key}${params.get('agent') && ['dashboard', 'contents', 'calendar', 'channels', 'agents'].includes(key) ? '?agent=' + encodeURIComponent(params.get('agent')!) : ''}`}
              className={path.startsWith(`/${key}`) ? 'active' : ''}
            >
              <Icon size={23} />
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="workspace">
          {avatarUrl ? (
            <img src={avatarUrl} alt={userName || name} className="avatar-img-sm" />
          ) : (
            <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong
              style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName || name}
            </strong>
            <small>{role}</small>
          </div>
          <button
            className="icon-button"
            aria-label={t('logout')}
            onClick={async () => {
              await api('auth', 'POST', { action: 'logout' });
              router.push('/login');
              router.refresh();
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {open ? (
        <button className="scrim" aria-label={t('close')} onClick={() => setOpen(false)} />
      ) : null}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button hamburger"
            aria-label={t('agents')}
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <form action="/search" className="search">
            {params.get('agent') && (
              <input type="hidden" name="agent" value={params.get('agent')!} />
            )}
            <Search size={19} />
            <input aria-label={t('search')} name="q" placeholder={t('search')} minLength={2} />
          </form>
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label={t('notifications')}
            onClick={async () => {
              const data = await api('notifications');
              setNotifications(data.items);
            }}
          >
            <Bell size={20} />
          </button>
          <Link href="/settings" className="topbar-avatar-link" title={userName || name}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName || name} className="topbar-avatar-img" />
            ) : (
              <span className="topbar-avatar-text">
                {(userName || name).slice(0, 2).toUpperCase()}
              </span>
            )}
          </Link>
          {role !== 'VIEWER' ? (
            <Link
              className="button"
              href={`/contents?new=1${params.get('agent') ? '&agent=' + encodeURIComponent(params.get('agent')!) : ''}`}
            >
              <Plus size={18} />
              <span>{t('newContent')}</span>
            </Link>
          ) : null}
        </header>
        <main className="page">{children}</main>
        <Copyright className="app-footer" />
      </div>
      {notifications ? (
        <Modal title={t('notifications')} onClose={() => setNotifications(null)}>
          {notifications.length ? (
            notifications.map((n) => (
              <p key={n.id}>
                <Link href={n.href} onClick={() => setNotifications(null)}>
                  {t(n.message)}
                </Link>
              </p>
            ))
          ) : (
            <Empty title={t('noNotifications')} />
          )}
        </Modal>
      ) : null}
    </div>
  );
}
