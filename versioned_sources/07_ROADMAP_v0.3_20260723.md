# 英语语流资产工具｜开发路线图与任务拆分

版本：0.3  
更新日期：2026-07-23

## 1. 总体顺序

```text
F0 工程、数据、导航与门禁基础
→ F1 来源内容与双层资产
→ F2 AI Orchestrator 与 R1—R3
→ F3 计划、问题与 R4—R5
→ F4 P05/P08 会话、R6 与恢复
→ F5 R7A/R7B
→ F6 R7C 与 P09
→ F7 记录、备份、发布
```

## 2. F0｜工程基础

### F0-01 仓库与应用骨架

- Next.js/React/TypeScript 桌面 Web 项目；
- 包管理、Lint、格式化、环境变量示例；
- 全局错误边界和状态组件；
- 本地启动说明。

### F0-02 应用壳和导航

- 固定侧栏、顶部状态；
- 所有一级导航可点击；
- 未实现页面有空状态；
- 设置六分区可点击、可深链、可键盘访问。

### F0-03 Prisma 与本地目录

- 落地 `prisma/schema.prisma`；
- format/validate、首个迁移、seed；
- data/files/logs/backups 目录；
- 路径和权限验证。

### F0-04 规则与门禁库

- P05 口头自评门禁；
- P05/P08 非空文字门禁；
- 重复提交幂等辅助；
- 单元测试覆盖边界。

### F0-05 AI 基础接口

- Provider Adapter 接口；
- AiTask/Attempt/ValidationIssue Repository；
- Release Bundle Registry；
- Mock Provider 和未配置状态。

### F0-06 Checkpoint、日志与测试

- Checkpoint 基础；
- Vitest、Playwright；
- F0 Gate 脚本和报告；
- README 与 RESULT 模板。

## 3. F1｜来源与资产

- 课程集合、导入批次和清单；
- DOCX/TXT/文本 PDF/ZIP/文件夹；
- 格式 span、块分类、重复处理；
- 候选审核、来源版本；
- 个人版本和节点映射；
- P05 连续段落 AssetFlowSpan 渲染。

## 4. F2｜R1—R3

- R1 提取、R2 编辑、R3 个人化；
- Prompt/Schema/Validator/Golden Set；
- 人工编辑和安全降级。

## 5. F3｜计划、问题和准备

- 本地资格候选池；
- R5 日计划和本地降级；
- R4 问题义务、支撑证明；
- P07 中文骨架和折叠表达。

## 6. F4｜训练会话

- P05 五步、遮挡复现、累积回忆；
- 口头自报与文字 Attempt；
- P08 第一次/追问/第二次非空提交；
- H0—H5；
- R6 和失败直达重答；
- 刷新恢复和并行编排。

## 7. F5｜R7A/R7B

- AnswerUnit；
- 资产调用和节点证据；
- 六维评价、问题归因和局部修正；
- 本地总分和部分结果。

## 8. F6｜R7C/P09

- 本地比较 facts；
- R7C 解释；
- 混合变化判断；
- P09 完整/部分/不可比较/本地模板状态。

## 9. F7｜支撑与发布

- 完整训练记录；
- 备份与恢复；
- AI 日志清理；
- Golden Set Runner；
- Provider 兼容；
- Release Gate 和回滚。

## 10. 首批 Iteration

- Iteration 01：F0-01 + F0-02；
- Iteration 02：F0-03；
- Iteration 03：F0-04 + F0-05 最小接口；
- 完成三轮后再审核是否进入 F1。

## 11. Definition of Done

每项任务必须有：实现、测试、错误/空状态、数据影响、文档更新、验收记录和 RESULT.md。未经 06 线程审核，不自动切换下一任务。
