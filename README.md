# 英语语流资产工作台｜本地 RC1

这是一个桌面优先、Windows 本地运行、单用户的网页应用。数据保存在本机 SQLite 和受控本地目录中；浏览器只访问本机服务，不会部署到公网。

## 系统要求

- Windows 10/11；
- Node.js `20.9` 或更高版本；
- pnpm `11` 或更高版本；
- 建议使用 Chrome、Edge 或其他现代桌面浏览器；
- 推荐工作宽度 1280px，最低保证宽度 1024px。

确认环境：在项目目录打开终端，运行 `node --version` 和 `pnpm --version`。

## 首次启动（推荐）

双击项目根目录的 `start-local.bat`。它会在不重置任何本地数据的前提下：

1. 检查 Node.js 与 pnpm；
2. 首次缺少依赖时执行锁定安装；
3. 生成 Prisma Client；
4. 创建本地数据目录、应用安全迁移并执行幂等 seed；
5. 构建生产版本；
6. 启动本地服务并打开浏览器。

默认访问地址是 [http://127.0.0.1:3000](http://127.0.0.1:3000)。启动成功后可看到左侧主导航和“今日训练”页面。

日常关闭时双击 `stop-local.bat`。它只会停止由 `start-local.bat` 记录且确认属于本项目的服务，不会扫描或结束其他 Node.js 进程。

## 开发模式与生产模式

开发模式（支持热更新）：

```powershell
pnpm install --frozen-lockfile
pnpm db:setup
pnpm dev --hostname 127.0.0.1 --port 3000
```

手动运行生产模式：

```powershell
pnpm prisma:generate
pnpm db:setup
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 3000
```

不要使用 `pnpm start -- --hostname ...` 传递参数；请使用上面的 `pnpm exec next start` 命令，或直接使用 `start-local.bat`。

## 本地数据位置

默认路径均相对于项目根目录：

| 内容          | 默认位置                   |
| ------------- | -------------------------- |
| SQLite 数据库 | `data/speech-asset-lab.db` |
| 来源文件      | `data/files/`              |
| 本地日志      | `data/logs/`               |
| 备份包        | `data/backups/`            |
| 隔离恢复副本  | `data/restore-staging/`    |

不要手工删除、移动或直接编辑 SQLite 文件。升级数据库使用 `pnpm db:setup`；它只应用未执行迁移并重复执行安全 seed，不会重置数据。

## AI Provider 配置

复制 `.env.example` 为仅保存在本机的 `.env.local`，再填写 Provider 配置。完整 API Key 只能填写在 `.env.local` 的 `AI_API_KEY` 中，绝不能写入代码、BAT、README、日志或浏览器字段。

未配置 API Key 时，应用仍可使用导入、资产、计划、训练、历史、设置、备份和恢复等本地功能；AI 相关操作会显示明确的本地安全降级状态。真实 Provider 兼容性检查、Golden Set、Bundle 批准与激活均需要用户在设置页主动操作，可能产生 API 费用。

## 备份与恢复

在“设置 → 备份与恢复”选择“创建本地备份”。备份包含 SQLite、受控来源文件、脱敏设置、Bundle 元数据和必要日志索引，并写入 manifest 与 SHA-256 校验信息。

“校验并隔离恢复”会先创建一份自动安全备份，再把所选备份恢复至 `data/restore-staging/`。它不会覆盖正在使用的数据库、来源文件或训练记录。

## 常见问题

- **提示找不到 Node.js 或 pnpm**：安装满足版本要求的运行环境后，重新打开终端或资源管理器再运行 BAT。
- **3000 端口已被占用**：先运行 `stop-local.bat`；若是其他应用占用，可在 `cmd.exe` 中运行 `set SPEECH_ASSET_LAB_PORT=3001 && start-local.bat`，再访问 `http://127.0.0.1:3001`。
- **页面没有 AI 结果**：确认 `.env.local` 只在本机保存；未配置、超时或结构错误都会保持安全降级，不会清除已保存输入。
- **数据库迁移失败**：确认当前目录是项目根目录，并运行 `pnpm db:setup`；不要使用数据库 reset 命令。
- **Windows 路径问题**：来源文件、日志、备份和恢复只能使用应用显示的受控本地目录；不要使用网络路径、符号链接或手工拼接的 `..` 路径。

## 验证与维护命令

```powershell
pnpm prisma:format
pnpm prisma:validate
pnpm exec prisma migrate status
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:run
pnpm test:e2e
pnpm build
```

项目规则、产品范围和当前有效事实来源见 [docs/09_SOURCE_MANIFEST.md](docs/09_SOURCE_MANIFEST.md)。
