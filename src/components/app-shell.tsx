'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { getPrimaryNavigation, type PrimaryNavigationItem } from '@/lib/navigation';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';

import { StatusStrip } from './status-strip';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (pathname === '/' || pathname === '/landing') {
    return <>{children}</>;
  }

  const isCloudTrial = isCloudTrialRuntime();
  const navigation = getPrimaryNavigation(isCloudTrial);
  const featuredNavigation = navigation.filter(
    (item) =>
      item.href === '/lab' ||
      item.href === '/assets' ||
      item.href === '/history' ||
      item.href === '/settings',
  );
  const utilityNavigation = navigation.filter(
    (item) => !featuredNavigation.some((featured) => featured.href === item.href),
  );

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="主导航">
        <Link className="brand" href="/lab" aria-label="Speech Asset Lab 工作台首页">
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
          {isCloudTrial ? '内置资产试用版' : '本地工作台'}
          <span>
            {isCloudTrial
              ? '训练进度仅保存在当前浏览器'
              : '所有内容保留在你的设备上'}
          </span>
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
  item: PrimaryNavigationItem;
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
