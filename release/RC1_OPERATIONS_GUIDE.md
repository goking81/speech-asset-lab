# RC1｜本地运维指南

## 首次安装与日常启动

1. 安装 Node.js 20.9+ 与 pnpm 11+；
2. 解压/放置项目到本地可写目录；
3. 双击 `start-local.bat`；
4. 在浏览器访问 `http://127.0.0.1:3000`（或自定义端口）。

脚本会执行依赖检查、Prisma Client 生成、安全迁移、幂等 seed、生产构建并启动服务。日常关闭运行 `stop-local.bat`。

## 数据与路径

- 数据库：`data/speech-asset-lab.db`；
- 来源文件：`data/files/`；
- 日志：`data/logs/`；
- 备份：`data/backups/`；
- 隔离恢复：`data/restore-staging/`。

所有路径必须位于本地受控目录；不要手工移动数据库或使用符号链接、网络路径、`..` 路径。

## AI 设置与状态

在 `.env.local` 本机填写 `AI_PROVIDER`、`AI_BASE_URL`、`AI_MODEL` 和 `AI_API_KEY`。密钥不进入浏览器、BAT、日志、备份元数据或版本控制。

未配置、超时或返回结构错误时，AI 功能显示本地安全降级，已保存回答、来源资产和个人资产不会丢失。Provider 兼容检测只能由用户在“设置 → AI 服务”主动触发。

## 备份、恢复与数据库升级

- 备份：设置页“备份与恢复 → 创建本地备份”；
- 恢复：选择“校验并隔离恢复”；系统先创建安全备份，再写入隔离目录，不覆盖当前数据；
- 升级：在项目根目录运行 `pnpm db:setup`，只应用未执行迁移并重复执行安全 seed；禁止使用 reset 命令。

## Bundle 回滚

只有通过 Golden Set 并经人工批准的 Bundle 能激活或作为回滚目标。进入“设置 → AI 服务”，选择明确的回滚操作并阅读确认提示。回滚只影响之后的新任务；历史会话保留自身冻结的 Bundle。

## 故障排查

- Node/pnpm 缺失：安装要求版本后重开终端；
- 端口占用：运行 `stop-local.bat`；或在 `cmd.exe` 运行 `set SPEECH_ASSET_LAB_PORT=3001 && start-local.bat`；
- 迁移异常：确认工作目录后运行 `pnpm db:setup`，不要删除 SQLite；
- 页面无 AI 结果：检查设置页状态；未配置/失败是可预期降级；
- 服务未停止：`stop-local.bat` 会拒绝结束未被项目记录确认的进程，避免误杀其他 Node.js 服务。

## 已知限制

本版本不含公网部署、移动端、录音、音频、转写、发音评分、登录、多用户、支付、社区或自由 Prompt 编辑。真实 Provider 验证和 Bundle 发布为人工门禁。
