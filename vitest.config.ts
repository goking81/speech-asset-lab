import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // SQLite 测试库需要先执行 Prisma 迁移；机械盘或并行迁移时会超过默认 10 秒。
    hookTimeout: 30000,
    // 各集成测试会创建并迁移独立 SQLite 文件；串行执行可避免 Windows 磁盘竞争和迁移超时。
    fileParallelism: false,
  },
});
