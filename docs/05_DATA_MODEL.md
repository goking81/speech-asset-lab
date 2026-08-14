# 英语语流资产工具｜数据模型

版本：0.4  
更新日期：2026-07-25  
对应参考 Schema：`prisma/schema.prisma`

## 1. 建模原则

1. 稳定身份与不可变版本分离；
2. 来源资产和个人资产双层并存；
3. AI 草稿与用户确认版本分离；
4. 正式门禁和列表依赖字段必须规范化，不能只存 JSON；
5. 用户数据先保存，AI 结果后写入；
6. 每个 AI 结果绑定业务版本、Release Bundle 和输入指纹；
7. 纯文字 MVP 不建立音频、录音、转写、发音或语音指标表。

## 2. 用户与设置

### User

单个本地用户。保存每日目标时长、每日新增目标/上限和活跃资产上限的默认值。

### UserFact

本地人工维护的个人事实，只有 `CONFIRMED` 事实可成为 R3 个人化和后续问题支撑的输入；AI 不得自行创建或确认事实。

### UserSetting

键值型扩展设置；只用于低频、非门禁配置。门禁依赖的核心设置应保留为明确列。

### AiProviderConfig

Provider、Base URL、模型、Key 引用/掩码、超时、重试和备用 Provider。完整 Key 不进入数据库普通日志。

### BackupRecord

备份文件、范围、状态、校验 Hash、创建时间和恢复记录。

## 3. 来源导入

```text
SourceCollection
  ├─ ImportBatch
  │    └─ ImportBatchFile
  │          └─ SourceDocument?
  └─ SourceDocument
         └─ SourceSegment
                └─ SourceSpanAnnotation
```

- 不支持文件保留 ImportBatchFile，但不创建 SourceDocument；
- 原始文件 Hash 与规范文本 Hash 分离；
- 精确重复默认不进入 R1，近重复保存用户决策；
- DOCX 格式标记引用稳定文本 offset；
- 原文件只读，解析副本修改形成新解析版本或 changeSet。

## 4. 来源资产

### CandidateAsset

R1/R2 或人工建立的草稿，状态包括待审核、编辑中、已确认、忽略和失败。证据必须指向 SourceSegment 和文本范围。确认后通过唯一的 `sourceAssetVersionId` 连接到创建出的来源资产版本，保留候选、来源文档、段落与范围的完整追溯链。

### SourceAsset / SourceAssetVersion

SourceAsset 是稳定身份；确认后的 SourceAssetVersion 不可变。重构型必须保存 AI 重构标识和多个来源证据。

### SourceAssetNode / ExpressionUnit

节点和表达单元绑定具体版本。ExpressionUnit 类型包括词伙、句式骨架、连接表达和词汇锚点。

## 5. 个人资产

### PersonalAsset / PersonalAssetVersion

稳定身份 + 不可变版本。保存个人触发名称、核心观点、核心/扩展语流、场景、表达功能和确认信息。

### PersonalAssetNode / PersonalExpressionUnit

绑定个人版本。

### PersonalNodeSourceMap

个人节点到来源节点的多对多追溯：保留、改写、合并、拆分、AI 桥接、用户新增。

### AssetFlowSpan

用于 P05 连续段落中的逻辑节点定位：

- `personalAssetVersionId`；
- `personalAssetNodeId`；
- `startOffset`、`endOffset`；
- `sequence`；
- `textHash`。

不保存颜色。前端由节点 NodeType 映射设计 Token。保存时校验范围不越界，允许相邻 span，不允许未声明的重叠。

## 6. 掌握状态与关系

### UserAssetState

引用 PersonalAsset 稳定身份，保存 S0—S5、用户可见阶段、理解/复现/调用/灵活性/拼贴/迁移累计指标、复习参数和激活状态。AI 不直接更新。

### QuestionAssetRelation / PersonalAssetRelation

草稿、确认、拒绝、归档。AI 只能提出草稿。

## 7. 问题计划

- Question：课程、AI、用户真实或人工问题；
- QuestionPlan：冻结问题、难度、视角、沟通目标和支撑证明；
- QuestionPlanAsset：冻结主资产及最多一项补充资产的具体版本；
- QuestionObligation：required/optional 义务；
- QuestionSupportMapping：义务到资产节点、确认事实或题面上下文。

## 8. 今日计划与 P05 训练

### DailyPlan / TrainingTask

保存本地资格快照、优先级、AI 理由和降级来源。

### AssetPracticeSession

一次 P05 资产训练会话：

- 个人资产版本快照；
- 当前五步和状态；
- 来源 DailyPlan/TrainingTask；
- 开始、完成、放弃时间；
- 当前 Checkpoint。

### AssetPracticeCheckpoint

每个进行中的 P05 会话仅保留一个可覆盖的当前检查点，用于恢复当前步骤与未提交的界面草稿。它不替代、也不修改历史 `AssetPracticeAttempt`。

### AssetPracticeAttempt

每一步或子任务的一次独立尝试：

- `stepType`：READING、KEYWORD_RECALL、LOGIC_SKELETON_RECALL、NO_HINT_RECALL、ANCHOR_TEXT、CLOZE_RECALL、CUMULATIVE_RECALL；
- `modality`：READ_ONLY、ORAL_SELF_REPORT、TEXT；
- `oralAttemptConfirmed`；
- `completionRating`：COMPLETE/BASIC/PARTIAL/NOT_COMPLETED；
- `difficultyRating`：EASY/RIGHT/DIFFICULT；
- `highestHintLevel`；
- `textAnswer`（仅文字步骤）；
- `startedAt`、`completedAt`、`durationMs`；
- `status` 和 `idempotencyKey`。

约束：

- 第 2—4 步必须是 ORAL_SELF_REPORT 且不得有音频字段；
- ORAL_SELF_REPORT 完成时三项自报字段必须满足业务校验；
- ANCHOR_TEXT 的 `trim(textAnswer)` 必须非空；
- 重练创建新 Attempt，不覆盖历史。

## 9. P08 会话与回答

### TrainingSession

保存比较组、QuestionPlan、阶段快照、Release Bundle、状态、业务版本和 Checkpoint。

### TrainingAnswer

统一保存 FIRST_ANSWER、FOLLOW_UP_ANSWER、SECOND_ANSWER。业务层要求 `trim(text).length > 0`。数据库不以最少词数做约束。

### AnswerUnit

本地切分句子/从句/短语并保存稳定 ID 和 offset，供 R7 引用。

### FollowUpItem / HintEvent

追问保存支撑证明、issuedIndex、状态和结束原因。HintEvent 只记录 H1—H5；H0 为默认无事件。

## 10. R7 结果

- AssetUsageResult / AssetUsageAssessment / NodeUsageEvidence / ObligationCoverage；
- AnswerEvaluationResult / AnswerDimensionRating / EvaluationIssue / Recommendation / Correction；
- AnswerComparisonResult / DimensionComparison / ObligationChange / NodeChange。

正式总分只在六维全部有效后由本地写入。

## 11. AI 编排与版本

- AiReleaseBundle：不可变发布包；
- PromptDefinition / AiReleasePrompt；
- AiTask：逻辑任务和唯一幂等键；
- AiTaskAttempt：Provider 重试、Fallback、结构修复和业务修复；
- AiValidationIssue；
- SessionCheckpoint。

### 发布门禁与审计

- AiGoldenSetCase：按 AI 角色冻结的合成输入与本地结构期望；不得包含真实用户回答、个人事实、资产正文或密钥；
- AiGoldenSetRun / AiGoldenSetResult：记录 Bundle、Provider/模型、运行环境、通过/失败状态、原因和输出摘要 Hash；不保存原始模型输出；
- AiProviderCompatibility：记录 Provider/模型配置状态、最近测试时间、兼容结果和本地降级状态；
- AiReleaseAuditEvent：记录候选、Golden Set、人工批准、激活、弃用、撤回和回滚。历史 TrainingSession 继续使用自身冻结的 `releaseBundleId`。

候选 Bundle 必须先有覆盖其全部角色的通过 Golden Set，才能从 CANDIDATE 进入 APPROVED；只有人工批准后的 Bundle 才能激活或成为回滚目标。

唯一幂等维度：

```text
role + entityId + entityVersion + releaseBundleId + inputFingerprint
```

## 12. 设置页数据

设置导航本身是前端配置，不需要持久化表。各分区读取：

- 训练目标 → User 核心列；
- AI 服务 → AiProviderConfig；
- 本地目录 → AppConfig/环境配置；
- 备份 → BackupRecord；
- 日志隐私 → UserSetting 或本地配置；
- 发布门禁 → AiReleaseBundle、AiGoldenSetRun、AiProviderCompatibility、AiReleaseAuditEvent；
- 实验功能 → FeatureFlag，仅存已批准开关；无实验时返回空列表。

## 13. 事务规则

1. 用户输入与自评在单一事务中保存；
2. 事务成功后才创建 AI Task；
3. Provider 响应先写 Attempt，再校验，再写正式结果；
4. 旧输入指纹结果标记 SUPERSEDED；
5. 用户确认版本不可被 AI 更新；
6. 重复按钮点击使用业务幂等键去重。

## 14. 开发前校验

- `prisma format`；
- `prisma validate`；
- 空库迁移；
- seed；
- 唯一约束、级联删除、版本不可变、重复提交、过期结果、P05 自评门禁和 P08 非空提交测试。
