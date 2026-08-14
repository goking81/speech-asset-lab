'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { primaryNavigation } from '@/lib/navigation';

import { StatusStrip } from './status-strip';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const featuredNavigation = primaryNavigation.filter(
    (item) =>
      item.href === '/' ||
      item.href === '/assets' ||
      item.href === '/history' ||
      item.href === '/settings',
  );
  const utilityNavigation = primaryNavigation.filter(
    (item) => !featuredNavigation.some((featured) => featured.href === item.href),
  );

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="主导航">
        <Link className="brand" href="/" aria-label="Speech Asset Lab 首页">
          <Image
            alt=""
            className="brand__mark"
            height={96}
            src="/images/brand-evergreen-mark.png"
            width={96}
          />
          <span>
            <strong>Speech Asset Lab</strong>
            <small>英语语流资产工作台</small>
          </span>
        </Link>
        <nav className="primary-nav" aria-label="一级导航">
          <div className="primary-nav__featured">
            {featuredNavigation.map((item, index) => (
              <NavigationLink
                index={index + 1}
                isCurrent={pathname === item.href}
                item={item}
                key={item.href}
              />
            ))}
          </div>
          <div className="primary-nav__utilities" aria-label="其他功能">
            {utilityNavigation.map((item, index) => (
              <NavigationLink
                index={index + featuredNavigation.length + 1}
                isCurrent={pathname === item.href}
                item={item}
                key={item.href}
              />
            ))}
          </div>
        </nav>
        <p className="sidebar-note">
          本地工作台
          <span>所有内容保留在你的设备上</span>
        </p>
      </aside>
      <div className="app-shell__workspace">
        <StatusStrip />
        <div className="app-shell__content">{children}</div>
      </div>
    </div>
  );
}

function NavigationLink({
  index,
  isCurrent,
  item,
}: {
  index: number;
  isCurrent: boolean;
  item: (typeof primaryNavigation)[number];
}) {
  return (
    <Link
      className="primary-nav__link"
      href={item.href}
      aria-current={isCurrent ? 'page' : undefined}
      title={item.description}
    >
      <span className="primary-nav__index" aria-hidden="true">
        {String(index).padStart(2, '0')}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
