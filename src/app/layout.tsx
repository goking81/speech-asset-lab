import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: '英语语流资产工作台',
  description: '桌面优先、本地运行的英语语流资产训练工具。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="warm-forest">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
