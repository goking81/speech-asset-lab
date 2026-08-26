import { NextResponse, type NextRequest } from 'next/server';

/**
 * 云端公开试用版的 API 边界。
 *
 * Next 16 的 `proxy.ts` 固定采用 Node.js 运行时，无法在 Cloudflare Workers 上执行；
 * 此处保留兼容的 Edge Middleware 约定，且不得引入 Node.js 专属模块。
 *
 * 旧工程的服务端接口以单用户 `local-user` 为前提；公开访客若访问它们会产生
 * 共享训练记录或读取管理员配置。因此公开域名只允许只读的内置资产请求。管理员
 * 接口则需同时显式开启私有导入，并由 Cloudflare Access 在边缘按路径保护。
 */
export function middleware(request: NextRequest) {
  const cloudTrial =
    process.env.NEXT_PUBLIC_APP_VARIANT === 'cloud-trial' ||
    process.env.APP_VARIANT === 'cloud-trial';
  if (!cloudTrial) return NextResponse.next();

  const path = request.nextUrl.pathname;
  const cloudAdminEnabled =
    process.env.NEXT_PUBLIC_CLOUD_IMPORT_ENABLED === 'true' ||
    process.env.CLOUD_IMPORT_ENABLED === 'true';
  const publicAssetRead =
    request.method === 'GET' && (path === '/api/assets' || /^\/api\/assets\/[^/]+$/.test(path));

  if (publicAssetRead || (cloudAdminEnabled && path.startsWith('/api/admin/'))) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      code: 'PUBLIC_TRIAL_API_UNAVAILABLE',
      error: '公开试用版仅提供内置资产阅读与浏览器本地训练进度。',
    },
    { status: 410 },
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
