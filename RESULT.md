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

---

# L1｜Landing Page Demo

完成日期：2026-08-23

## 实现摘要

- 新增独立介绍页 `/landing`，用森林学习台视觉语言解释语流资产、来源到个人资产的路径、训练顺序与 AI 的人工确认边界；
- Landing Page 不加载工作台侧栏、运行状态条或业务数据，首屏可独立访问；CTA 分别进入 `/`（内置资产试用工作台）与 `/assets`（资产库）；
- 页面明确说明当前线上为“内置资产试用版”，将“私有资料导入与 AI 整理”标为“规划中”，未新增上传、解析、OCR 或自动发布入口；
- 新增浏览器断言，防止后续把导入按钮误加入 Landing Page；修复了初版 Phosphor 图标在 Server Component 中加载引起的 500。

## 修改文件

- `src/app/landing/page.tsx`
- `src/features/landing/landing-page.tsx`
- `src/components/app-shell.tsx`
- `src/styles/globals.css`
- `tests/e2e/landing-page.spec.ts`
- `DESIGN.md`、`docs/design-qa.md`、`docs/04_DECISIONS.md`、`docs/09_SOURCE_MANIFEST.md`、`tasks/L1_LANDING_DEMO/TASK.md`

## 数据与迁移影响

- 无数据库迁移、无 Supabase 数据变更、无 AI Provider 调用；
- 不新增线上文件上传、Storage、OCR 或用户资料处理。

## 验收结果

- TypeScript `tsc --noEmit`：通过；
- Landing 相关 ESLint：通过；
- Prettier：通过；
- Next.js 生产构建：通过，`/landing` 为静态路由；
- 本地 Chrome `1440 × 1000`：`/landing` 返回 200，首屏、CTA、内置资产试用版说明和“规划中”边界均确认；截图为 `test-results/landing-demo-local.png`。

## 偏差与未解决问题

- 无产品规则偏差；
- “私有资料导入后由 AI 整理”未在本任务实现，需作为下一任务先确定私有 Storage、文件限制、隐私处理、OCR 策略、AI 草稿结构和人工确认流程。

## 下一步建议

建议创建 L2：私有资料导入与 AI 整理设计及受控实现。

---

# UX-P05｜五步训练清晰化

完成日期：2026-08-27
状态：已完成并发布验证

## 交付结论

已将单资产训练固定为“看全文读顺 → 看词伙说出 → 看结构复述 → 无提示复现 → 默写输出”。训练页只保留当前步骤所必需的材料和动作提示：来源出处、中文翻译/注释与 P05 内的锚点问题均不再显示；问题调用继续由独立 P06—P09 承担。

## 实现内容

- 左侧五步导航改为明确的“看什么｜做什么”，并显示提示从完整资产递减至无提示的过程；
- 第 1 步仅显示完整个人语流；第 2 步仅显示英文词伙；第 3 步仅显示中文逻辑骨架；第 4 步只保留口头复现说明、计时与自报；
- 第 5 步改为无提示默写，允许任意非空英语文本，不要求逐字一致，不自动触发 AI 评价；
- 旧资产若尚未单独保存词伙，第 2 步会从冻结的逻辑节点中读取短表达，绝不退回展示完整原文；
- 今日训练中的步骤说明同步为新五步名称；历史会话和历史提示等级保持可读取，新的 P05 写入统一保存为 H0。

## 修改范围

- `src/features/asset-practice/asset-practice-page.tsx`
- `src/server/practice/asset-practice-service.ts`
- `src/server/practice/asset-practice-service.test.ts`
- `src/features/planning/today-plan-page.tsx`
- `src/styles/globals.css`
- `docs/01_PRD.md`、`docs/02_PAGE_SPEC.md`、`docs/02_PROTOTYPE_SPEC.md`、`docs/04_DECISIONS.md`、`docs/04_PROMPT_COACH_RULES.md`、`docs/05_DATA_MODEL.md`、`docs/09_SOURCE_MANIFEST.md`、`docs/10_CONSISTENCY_AUDIT.md`

## 数据与兼容性

- 无 Prisma migration、无 Supabase 数据写入、无资料文件或训练历史删除；
- 保留 `ANCHOR_TEXT` 与 `textAnswer` 的历史数据兼容性，但它在新界面中呈现为“默写输出”；
- 来源可追溯信息继续在资产详情保留，不在训练会话泄露提示。

## 验收

- `pnpm run typecheck`：通过；
- `pnpm run lint`：通过；
- `pnpm exec prisma validate --schema prisma/schema.prisma`：通过；
- `pnpm exec vitest run src/server/practice/asset-practice-service.test.ts --reporter=verbose`：3/3 通过；
- `pnpm build`：通过；
- 本地桌面浏览器在 `http://127.0.0.1:3100` 依次检查第 1—5 步：第 2 步只见词伙、第 3 步只见逻辑结构、第 4—5 步无任何英文或结构提示，第 5 步为无提示默写输入框。

## 下一步

已提交 GitHub `main`（`e0c2443`），Cloudflare Git 自动发布至 `https://sa.learnbox.cc`。2026-08-27 已从正式地址的训练页资源验证到“看全文读顺”新文案；建议下一步由真实学习者完成一次第 1—5 步手工体验，重点确认词伙与逻辑骨架的可理解性。
