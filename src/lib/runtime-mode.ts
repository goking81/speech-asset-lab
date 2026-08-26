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

/**
 * 云端公开试用库与管理员私有资料库必须始终分属不同用户。
 *
 * `local-user` 是既有内置资产迁移脚本使用的固定 id；不能再把它用于
 * 管理员导入，否则公开访客会读到管理员后来确认的来源资产。
 */
export const CLOUD_TRIAL_USER_ID = 'local-user';
export const CLOUD_ADMIN_USER_ID = 'cloud-admin';

/**
 * 云端导入并非默认开放：只有显式开启的私有来源导入版本才会放行。
 * 该开关不包含密钥，也不会把任何 Storage 凭据暴露给浏览器。
 */
export function isCloudImportRuntime() {
  return (
    isCloudTrialRuntime() &&
    (process.env.NEXT_PUBLIC_CLOUD_IMPORT_ENABLED === 'true' ||
      process.env.CLOUD_IMPORT_ENABLED === 'true')
  );
}

export function isLocalOnlyFeatureBlocked() {
  return isCloudTrialRuntime() && !isCloudImportRuntime();
}

/** 公开试用页面不能调用会写入共享数据库的旧单用户接口。 */
export function isPublicCloudTrial() {
  return isCloudTrialRuntime();
}
