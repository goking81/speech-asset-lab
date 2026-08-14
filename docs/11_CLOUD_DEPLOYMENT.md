# RC2 私有云端发布计划

更新日期：2026-08-14  
状态：执行中

## 1. 目标架构

```text
https://speechasset.learnbox.cc
  └─ Cloudflare Access（仅授权用户）
      └─ Cloudflare 应用运行时
          ├─ Supabase PostgreSQL（业务数据）
          └─ Supabase 私有 Storage（来源原件、备份）
```

`learnbox.cc` 保留为未来项目入口；本应用只使用子域名 `speechasset.learnbox.cc`。

## 2. 已完成

- GitHub 公开代码仓库：`goking81/speech-asset-lab`。
- `.gitignore` 已排除 `data/`、数据库、备份、日志和 `.env*`；329 个本机资料文件未进入 GitHub。
- Supabase 新加坡生产项目已创建：`kzxncbmooeaipgbipaid`（`ap-southeast-1`）。
- 生产数据库的 `public` schema 已核对为空。

## 3. 迁移顺序

1. 建立 PostgreSQL 基线与本地 SQLite 到 PostgreSQL 的一次性数据迁移工具。
2. 将上传、来源文件和备份抽象为存储接口；生产环境接入 Supabase 私有 Storage。
3. 替换仅能在本机执行的 PDF / OCR 处理链路；扫描件 OCR 的云端服务需单独选择并配置，不能静默关闭。
4. 适配 Cloudflare 运行时，配置环境变量与 secrets；严禁将数据库密码、DeepSeek Key、Supabase service role key 写入仓库或前端。
5. 配置 Cloudflare Access、部署预览环境、生产域名与 DNS。
6. 导入经确认的初始资料，执行端到端回归、私有文件访问检查、备份恢复演练后发布。

## 4. 当前已知差异

| 现有 RC1 能力 | 线上替代方案 | 状态 |
| --- | --- | --- |
| SQLite + Prisma | Supabase PostgreSQL 独立基线 | 待实施 |
| `data/files` | Supabase 私有 Storage | 待实施 |
| 本地备份、日志 | 私有 Storage 与受控运行日志 | 待设计 |
| Python / Poppler / Tesseract / Windows OCR | 云端兼容解析与 OCR 服务 | 待选择 |
| 本机服务访问 | Cloudflare Access 保护的子域名 | 待配置 |

## 5. 发布门禁

- 不公开来源原件、备份、数据库、日志或 API Key。
- 线上只能让授权用户访问；不得因为应用没有登录页而公开暴露数据。
- AI 提问仍仅由已掌握资产支撑；AI 产出仍必须由用户确认。
- 数据迁移、Storage 策略、Cloudflare Access 和域名均完成回归后才切换正式域名。
