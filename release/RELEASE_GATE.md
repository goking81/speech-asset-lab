# 正式进入 Codex 前发布门禁

检查日期：2026-07-25

## 结论

**F0 Gate Pass — F0 验收已完成；F1 仍须在负责人审核后创建任务卡并更新 CURRENT/Manifest。**

| Gate | 项目 | 结果 | 说明 |
|---|---|---|---|
| G0 | MVP 范围冻结 | PASS | 桌面、本地、单用户；排除移动、语音、支付、社区、公网 |
| G1 | 事实来源唯一 | PASS | Manifest v0.8 和冲突优先级已写入 |
| G2 | 文档一致性 | PASS | 五项原型增量已回写各文档 |
| G3 | 页面/原型状态 | PASS | P05、P08、P15 门禁和状态已定义 |
| G4 | 数据模型概念完整 | PASS | 新增 span、P05 会话/尝试、设置和幂等边界 |
| G5 | Prisma 实机验证 | PASS | `prisma format/validate/generate`、首迁移、seed 与可重复 `db:setup` 已通过 |
| G6 | 开发任务可执行 | PASS | F0 与前三个 Iteration 已拆分 |
| G7 | 本机运行与测试 | PASS | 生产构建、生产冷启动、8 个 Vitest 文件/28 项及 5 个 Playwright 用例通过 |
| G8 | AI Release Bundle 实现 | DEFERRED | F0 只建接口；F2 前成为阻断项 |
| G9 | 真实 Provider 兼容 | DEFERRED | 不阻断 F0，不得在 F0 接真实业务调用 |

## F0 进入条件（已满足）

- 使用本包作为仓库根事实来源；
- `tasks/CURRENT.md` 指向 F0 发布审核；
- Codex 不读取旧无版本文件作为事实；
- 只实现当前 TASK。

## F1 进入条件

必须全部通过：

1. Prisma format/validate/migrate/seed；
2. 应用冷启动；
3. 一级导航与设置六分区 E2E；
4. P05/P08 门禁单测；
5. 本地目录与路径安全测试；
6. API 未配置降级；
7. F0 RESULT.md 审核；
8. 创建经审核的 F1 任务卡，并更新 CURRENT 和 Manifest。

当前第 8 项尚未执行，因此本文件不授权自动启动 F1。
