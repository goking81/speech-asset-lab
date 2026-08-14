# RC1｜最终事实与实现覆盖审计

审计日期：2026-07-27  
依据：`docs/09_SOURCE_MANIFEST.md` 当前映射、实际源码、Prisma 迁移、浏览器验收、Vitest 与 Playwright。  
状态枚举仅使用：完整、部分、缺失、不适用、等待人工验证。

| 需求/页面 | 实现与代码证据 | 测试/运行证据 | 状态 | 发布处理 |
| --- | --- | --- | --- | --- |
| P01 今日训练与本地资格 | `src/features/planning/today-plan-page.tsx`、`src/server/planning/local-daily-plan-service.ts` | `today-plan.spec.ts`、`local-daily-plan-service.test.ts` | 完整 | 本地规则生成；无资产展示真实引导 |
| P02—P04 双层资产与个人化 | `src/features/assets/`、`src/server/assets/personal-asset-service.ts` | `asset-library.spec.ts`、`database-constraints.test.ts` | 完整 | 来源/个人版本分离且可追溯 |
| P05 单资产五步 | `asset-practice-page.tsx`、`asset-practice-service.ts` | `practice-gates.spec.ts`、`asset-practice-service.test.ts` | 完整 | 连续段落、口头自报与非空文字门禁均保留 |
| P06—P08 问题准备与两次回答 | `features/questions/`、`features/training-session/` | `question-practice.spec.ts`、`p08-practice.spec.ts`、`p08-session-service.test.ts` | 完整 | 问题/追问均由冻结支撑证明约束 |
| P09 复盘 | `p09-review-page.tsx`、`r7c-review-service.ts` | `p09-review.spec.ts`、`r7c-review-service.test.ts` | 完整 | AI 不可用时只显示本地 facts/模板 |
| P10 导入与文件安全 | `import-intake-service.ts`、`text-parser-service.ts`、`zip-metadata.ts` | `import-intake.spec.ts`、`import-limits.test.ts`、`zip-metadata.test.ts` | 完整 | 本地受控路径、限额和 Zip Slip 防护 |
| P11 候选审核 | `candidate-review-page.tsx`、`candidate-review-service.ts` | `candidate-review.spec.ts` | 完整 | 无一键发布；确认后才创建来源版本 |
| P12 关系图谱 | `/graph` 空状态页 | `navigation.spec.ts` | 不适用 | P1，未实现全局图谱可视化 |
| P13 训练历史 | `training-history-page.tsx`、`training-history-service.ts` | `history-settings.spec.ts`、`training-history-service.test.ts` | 完整 | P05/P08、冻结 Bundle 与降级来源可回看 |
| P14 关于我 | `facts-page.tsx`、`/api/facts` | 页面路由/空状态验收 | 部分 | P1 人工事实维护已提供；不包含 AI 画像 |
| P15 设置 | `settings-page.tsx`、`/api/settings/*` | `history-settings.spec.ts`、`settings-navigation.test.ts` | 完整 | 训练目标、本地目录、备份、隐私、实验空状态均可访问 |
| R1—R3 草稿与人工确认 | `r1-draft-processor.ts`、资产草稿 API | 导入/候选测试与结构校验 | 完整 | 只生成草稿，不自动发布资产 |
| R4/R4A 受支撑问题 | `supported-question-service.ts`、`r4-draft-service.ts` | `supported-question-service.test.ts` | 完整 | 无已掌握资产支撑时拒绝创建 |
| R5 Coach | `r5-coach-service.ts` | `coach-fallback.spec.ts`、`r5-coach-service.test.ts` | 完整 | Provider 不可用时保留本地计划 |
| R6 追问 | `r6-follow-up-service.ts` | `p08-session-service.test.ts` | 完整 | 最多三轮，失败直接进入第二次回答 |
| R7A/R7B/R7C | `r7a-usage-service.ts`、`r7b-evaluation-service.ts`、`r7c-review-service.ts` | 对应 16 项单元/集成断言与 P09 E2E | 完整 | 本地总分、部分结果和 facts/解释严格分离 |
| 来源/个人资产不可变与 SQLite | `prisma/schema.prisma`、9 个迁移 | `database-constraints.test.ts`、`prisma migrate status` | 完整 | 来源追溯与版本不可变受服务/数据库约束 |
| 备份、恢复、日志隐私 | `local-backup-service.ts`、`privacy-service.ts` | 单测、浏览器创建备份、隔离恢复演练 | 完整 | 恢复仅输出隔离副本；敏感值脱敏 |
| Golden Set、兼容、Bundle 回滚 | `release-gate-service.ts`、设置页发布面板 | `release-gate-service.test.ts`、发布门禁 E2E | 完整 | 代码门禁完整；不自动批准或激活 |
| 真实 Provider 兼容性/语义质量 | 设置页主动入口 | 未由 RC1 自动调用 | 等待人工验证 | 需要用户主动操作，可能产生费用 |
| 真实候选 Bundle 的批准与激活 | 受控服务/API 与审计表 | 自动化覆盖拒绝/批准/回滚规则 | 等待人工验证 | 当前本地没有待发布候选；不可绕过 Golden Set |

## 审计结论

当前定稿范围内没有未解释的自动化发布阻塞缺口。P12/P14 的受限状态已按规格标记；真实 Provider 与 Bundle 发布是明确的人工作业，不属于自动化通过项。
