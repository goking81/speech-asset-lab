# Iteration 03｜P05/P08 门禁规则与 AI 基础接口

## 前置

Iteration 02 审核通过后，由负责人更新 `tasks/CURRENT.md`。

## 目标

实现可复用、前后端一致的门禁规则，以及不连接真实 Provider 的 AI 任务基础。

## 必做

1. `canSaveOralAttempt()`：确认口头尝试 + 完成情况 + 难度 + 非保存中；
2. `canSubmitTextAnswer()`：trim 后非空 + 会话有效 + 非提交中；
3. 服务端同规则校验；
4. P08 不允许最少词数/句数门禁；
5. 事务性保存后创建 AiTask；
6. 重复提交幂等；
7. Provider Adapter、Mock Provider、Release Bundle Registry、AiTask/Attempt 基础接口；
8. API 未配置、超时、失败、SUPERSEDED 状态测试；
9. 在简单 Story/测试页验证按钮由灰变可用。

## 关键测试

- 两项自评任一缺失时禁用；
- 状态补齐后同一渲染周期内启用；
- 纯空格禁用；
- 单个英文单词、中文字符或标点之外的非空内容可提交；
- 双击只创建一条 Attempt/Answer；
- AI 失败仍保留 Answer；
- `INSUFFICIENT_TEXT` 不回滚提交。
