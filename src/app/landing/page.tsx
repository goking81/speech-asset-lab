import type { Metadata } from 'next';

import { LandingPage } from '@/features/landing/landing-page';

export const metadata: Metadata = {
  title: 'Speech Asset Lab｜让英语表达成为可积累的资产',
  description: '把有价值的英语表达整理为可追溯、可训练、可调用的语流资产。',
};

export default function LandingDemoPage() {
  return <LandingPage />;
}
