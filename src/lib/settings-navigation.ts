export type SettingsSectionId =
  'training' | 'ai' | 'storage' | 'backup' | 'privacy' | 'experiments';

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
};

export const settingsSections = [
  {
    id: 'training',
    label: '训练目标',
    description: '调整本地计划容量；阶段、资格和拼贴解锁仍由本地规则裁决。',
  },
  {
    id: 'ai',
    label: 'AI 服务',
    description: 'Provider 只在本地服务端读取；AI 输出始终是可确认的草稿。',
  },
  {
    id: 'storage',
    label: '本地数据与目录',
    description: '工作台数据将保留在本机目录中。',
  },
  {
    id: 'backup',
    label: '备份与恢复',
    description: '创建可校验的本地备份；恢复只生成隔离副本，不会覆盖当前数据。',
  },
  {
    id: 'privacy',
    label: 'AI 日志与隐私',
    description: 'AI 相关内容将遵循本地优先与人工确认原则。',
  },
  {
    id: 'experiments',
    label: '实验功能',
    description: '这里会展示经过明确标注、可随时退出的本地实验能力。',
  },
] as const satisfies readonly SettingsSection[];
