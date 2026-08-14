export type PrimaryRoute =
  '/' | '/assets' | '/practice' | '/content' | '/graph' | '/history' | '/profile' | '/settings';

export type PrimaryNavigationItem = {
  href: PrimaryRoute;
  label: string;
  description: string;
};

export const primaryNavigation = [
  { href: '/', label: '今日训练', description: '从已掌握资产开始今天的练习。' },
  { href: '/assets', label: '资产库', description: '查看并管理语流资产。' },
  { href: '/practice', label: '问题训练', description: '用已掌握资产组织表达。' },
  { href: '/content', label: '内容工作台', description: '整理来源内容和候选资产。' },
  { href: '/graph', label: '关系图谱', description: '查看资产之间的关联。' },
  { href: '/history', label: '训练记录', description: '回顾训练过程。' },
  { href: '/profile', label: '关于我', description: '查看个人学习概览。' },
  { href: '/settings', label: '设置', description: '调整本地工作台配置。' },
] as const satisfies readonly PrimaryNavigationItem[];
