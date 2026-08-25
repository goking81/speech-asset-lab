import type { Metadata } from 'next';

import { TodayPlanPage } from '@/features/planning/today-plan-page';

export const metadata: Metadata = {
  title: '今日训练｜Speech Asset Lab',
  description: '从已确认的个人语流资产开始今天的英语表达训练。',
};

/** 已登录试用者的学习工作台首页。 */
export default function LabPage() {
  return <TodayPlanPage />;
}
