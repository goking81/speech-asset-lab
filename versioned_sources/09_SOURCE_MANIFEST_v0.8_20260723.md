# 项目来源文件清单

版本：0.8  
更新日期：2026-07-23

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
| 产品决策 | `04_DECISIONS_v0.7_20260723.md` | `docs/04_DECISIONS.md` | 0.7 |
| Prompt/Coach | `04_PROMPT_COACH_RULES_v0.3_20260723.md` | `docs/04_PROMPT_COACH_RULES.md` | 0.3 |
| 数据模型 | `05_DATA_MODEL_v0.3_20260723.md` | `docs/05_DATA_MODEL.md` | 0.3 |
| 技术架构 | `06_ARCHITECTURE_v0.4_20260723.md` | `docs/06_ARCHITECTURE.md` | 0.4 |
| 路线图 | `07_ROADMAP_v0.3_20260723.md` | `docs/07_ROADMAP.md` | 0.3 |
| 聊天模板 | `08_CHAT_STARTERS_v0.4_20260723.md` | `docs/08_CHAT_STARTERS.md` | 0.4 |
| 来源清单 | `09_SOURCE_MANIFEST_v0.8_20260723.md` | `docs/09_SOURCE_MANIFEST.md` | 0.8 |
| Prisma Schema | `schema_v0.4_20260723.prisma` | `prisma/schema.prisma` | 0.4 |

## 3. 本次增量

- P05 连续自然段与逻辑节点颜色；
- P05 第2—4步口头自报、第3步骨架、第4步无提示、第5步文字；
- P05 自评、难度和保存继续门禁；
- P05/P08 任意非空文字提交，无隐藏词数限制；
- 设置导航可点击与明确空状态；
- 新增 AssetFlowSpan、AssetPracticeSession、AssetPracticeAttempt；
- F0、前三个 Iteration 和发布门禁封版。

## 4. 状态

06 开发交接已封版。允许进入 Codex F0；F0 门禁通过前不得进入 F1。
