import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  // OpenNext 需要保留这些依赖的 workerd 专用导出，避免在 Cloudflare 打包时丢失运行时文件。
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'pg-cloudflare'],
};

export default nextConfig;
