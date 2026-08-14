# 项目来源文件清单

版本：1.0  
更新日期：2026-07-27

## 1. 唯一生效规则

当前有效版本只由本 Manifest 指定。冲突优先级：

```text
DECISIONS → 当前 TASK → PROMPT_COACH_RULES
→ PRD / PAGE_SPEC / PROTOTYPE_SPEC / DESIGN_SYSTEM
→ DATA_MODEL / ARCHITECTURE / ROADMAP
```

ChatGPT 项目来源使用不可变版本名；本地仓库使用 `docs/` 中稳定逻辑文件名并由 Git 管理历史。

## 2. 当前有效映射

| 逻辑文档 | ChatGPT 不可变版本 | 本地稳定路径 | 版本 |
|---|---|---|---:|
| 项目主页 | `00_PROJECT_HOME_v0.8_20260723.md` | `docs/00_PROJECT_HOME.md` | 0.8 |
| PRD | `01_PRD_v0.5_20260723.md` | `docs/01_PRD.md` | 0.5 |
| 页面规格 | `02_PAGE_SPEC_v0.6_20260723.md` | `docs/02_PAGE_SPEC.md` | 0.6 |
| 原型规格 | `02_PROTOTYPE_SPEC_v0.4_20260723.md` | `docs/02_PROTOTYPE_SPEC.md` | 0.4 |
| 设计系统 | `03_DESIGN_SYSTEM_v0.3_20260723.md` | `docs/03_DESIGN_SYSTEM.md` | 0.3 |
| 产品决策 | `04_DECISIONS_v0.9_20260725.md` | `docs/04_DECISIONS.md` | 0.9 |
| Prompt/Coach | `04_PROMPT_COACH_RULES_v0.3_20260723.md` | `docs/04_PROMPT_COACH_RULES.md` | 0.3 |
| 数据模型 | `05_DATA_MODEL_v0.4_20260725.md` | `docs/05_DATA_MODEL.md` | 0.4 |
| 技术架构 | `06_ARCHITECTURE_v0.4_20260723.md` | `docs/06_ARCHITECTURE.md` | 0.4 |
| 路线图 | `07_ROADMAP_v0.3_20260723.md` | `docs/07_ROADMAP.md` | 0.3 |
| 聊天模板 | `08_CHAT_STARTERS_v0.4_20260723.md` | `docs/08_CHAT_STARTERS.md` | 0.4 |
| 来源清单 | `09_SOURCE_MANIFEST_v0.9_20260725.md` | `docs/09_SOURCE_MANIFEST.md` | 0.9 |
| Prisma Schema | `schema_v0.4_20260723.prisma` | `prisma/schema.prisma` | 0.4 |

## 3. 本次增量

- P05 连续自然段与逻辑节点颜色；
- P05 第2—4步口头自报、第3步骨架、第4步无提示、第5步文字；
- P05 自评、难度和保存继续门禁；
- P05/P08 任意非空文字提交，无隐藏词数限制；
- 设置导航可点击与明确空状态；
- 新增 AssetFlowSpan、AssetPracticeSession、AssetPracticeAttempt；
- F0、前三个 Iteration 和发布门禁封版。
- D-045 规定 F1 导入安全默认限额，并允许本地环境配置覆盖。
- D-046 规定 F1 近重复只提示、待用户决策的默认相似度规则。
- D-047 规定 R7B 的六维、0—100 分制、25/20/15/15/15/10 本地总分权重及不完整结果边界。
- F4-02 已完成 P08 的两次独立回答、草稿恢复与用户主动提示事件；未接入 R6/R7 时保留明确的本地直达第二次回答路径。
- F4-03 已完成 R6 受支撑单题追问、三轮上限、追问草稿恢复与失败/用户结束直达第二次回答；每条追问均保存冻结义务的支撑证明。
- F5-01 已完成 AnswerUnit 的本地确定性切分、R7A 资产/节点调用证据草稿、义务覆盖和局部/不可评价降级；新 P08 会话冻结 R6/R7A 共同 Bundle，历史 R6-only Bundle 保持不变。
- F5-02 已完成 D-047 定义的六维 R7B 草稿、本地总分裁决、问题/建议/修正草稿及完整、部分、不可评价降级；新 P08 会话冻结 R6/R7A/R7B 共同 Bundle，历史 Bundle 保持不变。
- F6-01 已完成两次 P08 回答的本地比较 facts、R7C 受限解释校验和 P09 复盘页面；新 P08 会话冻结 R6/R7A/R7B/R7C 共同 Bundle，历史 Bundle 保持不变，R7C 不可用时只展示真实本地事实与模板。
- F7-01 已完成 P13 只读训练历史（P05 单资产训练与 P08 问题训练）、可校验 SQLite/来源文件/设置/Bundle 元数据备份、隔离恢复与自动安全备份；日志隐私策略默认不保存原始响应，密钥类敏感值统一脱敏。
- F7-02 已完成合成 Golden Set、Provider/模型兼容记录、Bundle 候选/批准/激活/撤回/回滚审计与设置页发布门禁；新任务优先读取当前激活 Bundle，历史会话保持冻结引用不变。
- RC1 已完成 Windows 本地生产启动/停止入口、隔离 E2E 运行目录、训练目标设置、覆盖审计、用户验收、运维和发布门禁材料；真实 Provider、Bundle 批准与激活仍为人工门禁。

## 4. 状态

F0 Gate 已通过，F1-01 至 F1-04、F2、F3、F4-01、F4-02、F4-03、F5-01、F5-02、F6-01、F7-01 与 F7-02 已完成。RC1 自动化发布准备已完成；后续进入本地用户验收与真实 Provider/Bundle 人工门禁，不自动新增产品范围。
