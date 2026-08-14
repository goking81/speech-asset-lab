# Warm Forest 全站界面改造 QA

## 范围

- 视觉方向：Warm Forest（暖白画布、森林绿侧栏、中文衬线标题、圆角卡片）。
- 运行形态：桌面优先，本地单用户应用。
- 重点页面：今日训练、资产库、内容工作台、候选审核、问题训练、设置、资产详情、训练记录、关于我、训练门禁演示。

## 浏览器验证

- 浏览器：本机 Google Chrome 无头模式。
- 视口：1600 × 980。
- 验证日期：2026-08-06。
- 结果：所有已测页面均返回 HTTP 200，未发现页面脚本错误。

## 已检查的视觉点

- 固定深森林绿导航、暖白工作区和状态栏在所有页面一致。
- 中文页面标题使用衬线字体；今日训练包含 “Today’s practice” 副标题。
- 资产库以多列卡片平铺，避免长列表逐条占满整页。
- 候选审核采用来源段落与待确认候选并排的工作台布局。
- 设置中的训练目标采用等宽卡片字段，不再使用参差不齐的行内输入框。
- 返回入口统一位于内容区域左上方，未再给后续区块错误施加顶部留白。
- 表单、按钮、训练会话、历史记录和低频页面均继承同一圆角、描边、色彩与焦点状态。

## 截图证据

- `tmp/warm-forest-today-check.png`
- `tmp/warm-forest-assets-check.png`
- `tmp/warm-forest-review-check.png`
- `tmp/warm-forest-settings-check.png`
- `tmp/warm-forest-questions-check.png`
- `tmp/warm-forest-content-check.png`
- `tmp/warm-forest-asset-detail-check.png`
- `tmp/warm-forest-history-check.png`
- `tmp/warm-forest-profile-check.png`

## 结论

**PASS（桌面端）**。本轮仅改造视觉层与一个首页标题的展示结构；训练资格、来源/个人资产边界、AI 草稿确认机制及现有业务接口均未改变。
