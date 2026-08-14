# F1-02｜文本解析、格式 Span 与去重

## 前置

F1-01 已完成安全接收、批次清单和本地文件保存。

## 目标

将已接收的 TXT、DOCX、文本型 PDF 与粘贴文本逐文件解析为可追溯 `SourceDocument`、`SourceSegment` 和 `SourceSpanAnnotation`，并建立精确重复与近重复处理基础。

## 必做

1. 建立解析队列/Use Case 与文件状态机；批次中单文件失败不得阻断其他文件。
2. 解析 TXT 与粘贴文本；DOCX、文本型 PDF 仅在有可靠本地解析器时启用，否则保留明确“不支持/解析失败”状态，绝不伪造文本。
3. 创建 SourceDocument、按稳定顺序创建 SourceSegment；计算 parsedTextHash 与 SourceSegment textHash。
4. 保存格式范围为 SourceSpanAnnotation，offset 必须基于稳定规范文本且不越界。
5. 精确重复以规范文本 Hash 提示；近重复保留用户决策，不自动合并或删除。
6. 原文件保持只读；不得改写 ImportBatchFile 或覆盖已解析文档，重解析必须形成可追溯新状态。
7. 提供导入状态详情，显示待解析、已解析、精确重复、近重复、解析失败与跳过原因。

## 禁止

- 不执行 OCR、网页抓取、AI 文本修复或 AI 候选资产提取；
- 不因解析失败删除原始文件或整个批次；
- 不将 SourceDocument/Segment 直接等同来源资产；
- 不越过 SourceSpanAnnotation 的 offset/范围校验。

## 验收

- 同批 TXT 与粘贴文本可独立解析；单文件失败时其他文件仍完成；
- 精确重复不会自动进入后续候选提取；近重复有待决状态；
- 每个 Segment 的 sequence、textHash、offset 注解可重现；
- Prisma 集成测试覆盖事务、重复、解析失败和范围校验；页面/E2E 覆盖状态详情；
- `RESULT.md` 记录解析器支持矩阵和未启用的格式边界。
