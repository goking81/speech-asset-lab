# RC2 私有云端发布计划

更新日期：2026-08-14  
状态：执行中

## 1. 目标架构

```text
https://speechasset.learnbox.cc
  └─ Cloudflare Access（仅授权用户）
      └─ Cloudflare 应用运行时
          └─ Supabase PostgreSQL（内置资产、训练状态与记录）
```

`learnbox.cc` 保留为未来项目入口；本应用只使用子域名 `speechasset.learnbox.cc`。

## 2. 已完成

- GitHub 公开代码仓库：`goking81/speech-asset-lab`。
- `.gitignore` 已排除 `data/`、数据库、备份、日志和 `.env*`；329 个本机资料文件未进入 GitHub，也不属于首次线上发布。
- Supabase 新加坡生产项目已创建：`kzxncbmooeaipgbipaid`（`ap-southeast-1`）。
- 生产数据库的 `public` schema 已核对为空。

## 3. 迁移顺序

1. 建立 PostgreSQL 基线与本地 SQLite 到 PostgreSQL 的一次性内置资产迁移工具。只复制已确认的资产结构及可训练个人版本，不能复制原始资料、文件路径、候选、训练历史、备份、日志或 AI 原始响应。
2. 适配 Cloudflare 运行时，配置环境变量与 secrets；严禁将数据库密码、DeepSeek Key、Supabase service role key 写入仓库或前端。
3. 在线上移除导入、PDF 解析、OCR 与恢复入口，保留明确的试用版说明。
4. 配置 Cloudflare Access、部署预览环境、生产域名与 DNS。
5. 导入经确认的内置资产，执行端到端回归与访问控制检查后发布。

## 4. 当前已知差异

| 现有 RC1 能力 | 线上替代方案 | 状态 |
| --- | --- | --- |
| SQLite + Prisma | Supabase PostgreSQL 独立基线与安全种子脚本 | 已完成代码校验，待连接生产库执行 |
| `data/files` | 本次不迁移；原始资料继续本机保管 | 排除 |
| 本地备份、日志 | 本次不提供线上恢复；生产日志仅保留脱敏运行日志 | 待设计 |
| Python / Poppler / Tesseract / Windows OCR | 本次不发布；后续单独选择 OCR 服务 | 排除 |
| 本机服务访问 | Cloudflare Access 保护的子域名 | 运行配置已完成，待部署验证 |

## 5. Workers Builds 配置

- Worker 名称与 `wrangler.jsonc` 保持一致：`speech-asset-lab`。
- Cloudflare Workers Builds 的构建命令：`pnpm run cloud:build`。
- Cloudflare Workers Builds 的部署命令：`npx wrangler deploy`。
- 构建变量：`NEXT_PUBLIC_APP_VARIANT=cloud-trial`、`APP_VARIANT=cloud-trial`。
- 首次使用新构建命令和新依赖锁时应清除构建缓存；该操作不影响代码、域名或生产数据。

## 6. 当前工程风险

- 本机 Windows 下载 Cloudflare `workerd` 可选二进制连续超时，已在 10 分钟后停止重试。因此本机 OpenNext/Worker 预览尚未完成；Next.js 生产构建、Cloud Prisma 生成、类型检查、lint 和格式检查已通过。下一步必须由 Cloudflare Workers 的 Linux 构建执行 `cloud:build`，作为最终 Workers 打包验证。
- Supabase 生产库仍为空。执行 Prisma PostgreSQL migration 与种子前，必须在本机受保护环境或 Cloudflare secret 中配置连接串，禁止在聊天、GitHub 或前端变量中传递数据库密码。

## 7. 发布门禁

- 不公开来源原件、备份、数据库、日志或 API Key。
- 线上试用版不展示导入、PDF 解析、OCR 或恢复操作。
- 线上只能让授权用户访问；不得因为应用没有登录页而公开暴露数据。
- AI 提问仍仅由已掌握资产支撑；AI 产出仍必须由用户确认。
- 数据迁移、Storage 策略、Cloudflare Access 和域名均完成回归后才切换正式域名。
