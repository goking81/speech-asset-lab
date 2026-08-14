/**
 * 区分本机完整工作台与线上内置资产试用版。
 * 只读取公开的构建变量；密钥仍只能通过服务端环境变量提供。
 */
export function isCloudTrialRuntime() {
  return (
    process.env.NEXT_PUBLIC_APP_VARIANT === 'cloud-trial' ||
    process.env.APP_VARIANT === 'cloud-trial'
  );
}
