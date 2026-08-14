# 项目记忆索引

## 当前地图

- [initialize-f0-foundation.unit](units/initialize-f0-foundation.unit/0.setup-and-prisma-blocker.brief.md)：F0 初始化的工程基线、验证证据，以及 Prisma schema 的已确认阻断项。
- [build-static-shell.unit](units/build-static-shell.unit/0.navigation-shell.brief.md)：Iteration 01 的静态桌面应用壳、导航与浏览器验收约束。
- [build-local-storage.unit](units/build-local-storage.unit/0.sqlite-baseline.brief.md)：Iteration 02 的 SQLite 首迁移、seed、本地目录和约束验证。
- [build-training-gates.unit](units/build-training-gates.unit/0.p05-p08-ai-baseline.brief.md)：Iteration 03 的 P05/P08 共享门禁、事务幂等提交与 Mock AI 任务基线。
- [release-f0-foundation.unit](units/release-f0-foundation.unit/0.f0-gate.brief.md)：F0 最终门禁、Checkpoint、脱敏本地日志与冷启动验证。
- [plan-post-f0-development.unit](units/plan-post-f0-development.unit/0.execution-plan.brief.md)：F0 后 F1—F7 的 18 项顺序任务与启动约束。
- [build-source-parsing.unit](units/build-source-parsing.unit/0.f1-02-text-parsing.brief.md)：F1-02 的本地文本解析、段落 Span、重复待决与前端工作台边界。
- [build-source-review.unit](units/build-source-review.unit/0.f1-03-source-review.brief.md)：F1-03 的人工候选审核、来源证据和不可变来源资产版本。

## 故事线

2026-07-24 至 2026-07-25：交接包完整性通过；已建立 Next.js/TypeScript 本地骨架、依赖、格式化与 lint 配置，并完成生产构建。用户已授权将 30 个 Prisma 单行 enum 改为语法等价的多行定义，并确认 `AssetPracticeAttempt` 索引使用既有 `startedAt`。F0 审核确认后，Iteration 01 完成静态应用壳、设置 hash 导航与自动化验收。Iteration 02 完成 SQLite 首迁移、默认单用户 seed、本地目录与关键约束测试。Iteration 03 完成 P05/P08 共享纯门禁、服务端事务幂等保存、Mock Provider/Release Bundle/AiTask Attempt 基线与门禁演示页。F0 最终审核补齐 Checkpoint、脱敏本地日志和生产冷启动，并通过一键发布门禁。随后 F1-01 完成本地受限导入与批次清单；F1-02 完成本地 TXT / 粘贴文本解析、稳定段落 Span、精确/近重复待决及内容工作台；F1-03 完成真实人工候选审核、来源证据与不可变来源资产版本。当前已自动切换至 F1-04，准备建立独立个人资产和连续段落渲染。
