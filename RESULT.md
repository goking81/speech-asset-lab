# RC1｜本地可运行交付与自动化发布准备

完成日期：2026-07-27  
建议版本：`0.1.0-rc.1`

## 交付结论

**RC1 自动化发布准备完成。** Windows 本地生产服务已由 `start-local.bat` 实际启动并在浏览器访问；SQLite、来源文件、日志、备份与隔离恢复均已验证。真实 Provider 调用、语义审核、Bundle 批准/激活、Git Tag 和远程推送仍是用户人工门禁。

## 本次实现与修复

- 新增 `start-local.bat`、`stop-local.bat` 和安全的本地服务器记录脚本；启动脚本会生成 Prisma Client、应用安全迁移、执行幂等 seed、构建生产版本、监听本机并打开浏览器；停止脚本只结束确认属于本项目的进程；
- 更新 README 与 RC1 运维文档，明确 Windows 依赖、开发/生产命令、本地路径、端口冲突、AI 配置、备份、恢复和升级方式；
- 补齐设置页训练目标的本地读取/保存 API 与界面，且不允许它改写阶段、资格或拼贴解锁；修正备份/AI 区过期文案；
- 创建可重复的 RC1 覆盖审计、用户验收清单、已知问题、发布说明和门禁报告；
- Playwright 使用 `data/e2e-test/` 隔离 SQLite、来源文件、日志和备份目录，并显式清空 AI 配置，避免读写用户本地数据或调用真实 Provider；
- SQLite 集成测试改为串行文件执行，消除并行 Prisma 迁移竞争；修复旧 R6-only Bundle 降级和 P05 历史同时间戳顺序。

## 数据影响

- 没有新增 Prisma migration；当前本地仍为 9 个迁移且状态最新；
- RC1 浏览器验收新增了一份手动备份、一次自动安全备份与一个隔离恢复副本；没有覆盖当前 SQLite、来源文件或训练记录；
- E2E 只清理项目受控的 `data/e2e-test/` 测试目录，不操作正式本地数据库；
- 未写入或输出完整 API Key，未自动发起真实 Provider 调用，未自动批准/激活 Bundle。

## 自动化与手工验收

- `pnpm install --frozen-lockfile`、`prisma:format`、`prisma:validate`、`prisma migrate status`、`typecheck`、`lint`、`format:check` 均通过；
- Vitest：25 个文件、99 项测试通过；
- Playwright：21 项 E2E 通过；
- `pnpm build` 通过；`pnpm verify:cold-start` 在 `http://127.0.0.1:3101/` 通过；`pnpm db:setup` 重复执行无待应用迁移；
- 实际运行开发模式与生产模式；最终生产服务通过 `start-local.bat` 监听 `http://127.0.0.1:3000`；浏览器确认首页、应用壳、八个主导航、空数据库引导和零控制台错误；
- 实际创建 manifest 备份并通过 API 完成隔离恢复，自动安全备份已生成；
- 详细矩阵见 `release/RC1_SCOPE_AUDIT.md`，用户操作见 `release/RC1_USER_ACCEPTANCE.md`。

## 偏差与已知问题

- 无定稿产品规则偏差；P12 图谱与 P14 AI 画像仍按 P1/受限范围处理；
- 当前没有待发布的候选 Bundle；真实 Golden Set、Provider 兼容性语义与 Bundle 发布只能由用户主动执行和审核；
- 完整清单见 `release/RC1_KNOWN_ISSUES.md`。

## 下一步

用户可开始 RC1 本地验收。若需要验证真实 AI，请先阅读 `release/RC1_USER_ACCEPTANCE.md` 的人工 AI 发布步骤，再在设置页主动运行兼容检测和 Golden Set；不得跳过人工审核、批准或激活。
