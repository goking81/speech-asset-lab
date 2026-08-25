import type { Metadata } from 'next';

import { LandingPage } from '@/features/landing/landing-page';

export const metadata: Metadata = {
  title: 'Speech Asset Lab｜让英语表达成为可积累的资产',
  description:
    '把播客和文档里值得学习的英语表达，整理成可追溯、能反复训练、在真实场景中说出来的个人表达库。',
};

export default function LandingHomePage() {
  return <LandingPage />;
}
