# 英语语流资产工具｜技术架构

版本：0.4  
更新日期：2026-07-23  
适用：桌面优先、本地运行、单用户 MVP

## 1. 总体架构

```text
本地浏览器 UI
      ↓
本地应用服务
      ├─ 页面与业务 API
      ├─ 本地规则引擎
      ├─ 文档解析与导入队列
      ├─ SQLite + Prisma
      ├─ 本地文件/备份/日志
      ├─ AI Task Orchestrator
      └─ AI Provider Adapter
                 ↓ HTTPS
          外部云端模型 API
```

## 2. 分层

- UI：应用壳、页面状态、门禁、可访问性；
- Application：Use Case、事务、Checkpoint、幂等；
- Domain：资产、阶段、资格、评分、关系规则；
- Infrastructure：Prisma、文件存储、解析器、Provider、日志；
- AI Release：Prompt、Schema、策略、Golden Set 和 Provider 兼容矩阵。

## 3. 本地优先

- 数据库、来源文件、资产和训练记录默认本地保存；
- 用户未触发 AI 时不发送数据；
- 每次 AI 调用只发送当前任务所需的最小文本；
- API Key 由本地服务端读取，浏览器不可访问完整值。

## 4. P05 纯文字/口头自报架构

P05 第 2—4 步不使用 MediaDevices、Web Audio、录音库、音频文件、语音转写或后台监听。UI 只维护：

```text
oralAttemptConfirmed
completionRating
difficultyRating
highestHintLevel
durationMs
```

第 3 步骨架来自个人资产节点；第 4 步初始 payload 不返回可泄漏的关键词、骨架或英文完整语流。第 5 步才创建文字 Answer/Attempt。

## 5. 门禁实现

门禁必须由可单测纯函数计算，而不是分散在按钮组件：

```ts
canSaveOralAttempt(state)
canSubmitTextAnswer(state)
canNavigateSettingSection(section)
```

服务端再次校验，不能只依赖前端 disabled。

P08 不执行词数检查。AI 的 `INSUFFICIENT_TEXT` 是结果状态，不是 API 400 门禁。

## 6. 设置导航

设置分区采用单路由锚点或嵌套路由均可，但必须：

- 可深链；
- 刷新后保持当前分区；
- 键盘可达；
- 无内容时返回显式 empty-state DTO；
- 不把未实现项渲染为无反应按钮。

## 7. AI Provider Adapter

统一接口覆盖 R1—R7。Adapter 负责供应商转换、结构校验、重试和错误分类，不负责阶段、发布、正式状态和总分。

## 8. AI Orchestrator

- AiTask + Attempt；
- Release Bundle 冻结；
- input fingerprint；
- 重复点击幂等；
- 过期结果 SUPERSEDED；
- 结构修复和业务修复次数上限；
- 用户数据保存后再排队。

## 9. 导入安全

- 路径规范化和目录穿越防护；
- ZIP Slip 防护；
- 文件数量、单文件大小、总解压大小和压缩比限制；
- 只允许白名单类型；
- 音频标记跳过，不阻断批次；
- 文档逐文件、逐块发送 AI。

## 10. 备份与恢复

备份包含 SQLite、来源文件、用户设置、Prompt/Bundle 元数据和必要日志索引。恢复前校验版本、Hash 和剩余空间，并创建自动安全备份。

## 11. F0 工程边界

F0 建立：

- 项目骨架；
- 应用壳、导航和设置页面；
- Prisma 基线；
- 本地目录和配置；
- Adapter/Orchestrator 接口；
- 测试与门禁；
- 错误边界和状态组件。

F0 不实现真实 R1—R7、课程解析或完整业务页面。

## 12. 测试策略

- 单元：规则、门禁、评分、Hash、路径；
- 集成：Prisma 事务、幂等、Checkpoint、Provider Mock；
- E2E：应用启动、导航、设置、刷新恢复、P05/P08 门禁；
- Golden Set：F2 起逐角色加入；
- Release Gate：每个阶段自动输出报告。
