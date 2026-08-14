# Design QA · 沉浸式森林学习台

## 本次目标

- 参考图：`C:\Users\furong.xu\AppData\Local\Temp\codex-clipboard-d3963ed9-e437-41a9-945c-fae44ba87b39.png`
- 验收页面：`/`
- 目标状态：有本地今日训练任务，首张训练卡处于选中状态。

## 已完成的实现检查

- 已使用真实生成图片：森林侧栏、森林步道、晨间书桌、山间徒步。
- 首页已重构为三张横向训练卡、选中资产详情、语境与核心表达双栏、五步训练路径、折叠 AI 补充。
- 训练卡选择、资产详情跳转、开始五步训练与 AI 草稿请求均保留为可用交互。
- `pnpm lint`、TypeScript 检查和 `pnpm build` 已通过。

## 视觉比较

- 已获授权并使用 Chrome 在 `1486 × 1057` 视口完成截图对照。
- 最终截图：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-today-qa-final.png`。
- 已逐项调整并复核：主内容左右位置、三卡比例与插图尺寸、主标题的中英字体层级、焦点资产面板、语境/核心表达双栏、五步时间线、主按钮和折叠 AI 补充的垂直节奏。
- 侧栏已使用真实生成的常青树品牌标识；资产库、内容工作台和问题训练均已在同一 Chrome 视口中复查，保留对应业务流程并共享森林工作台的结构语言。
- 保留产品真实数据：卡片标题、训练资格理由、核心语流和训练步骤均来自本地资产与计划；未以参考图文案覆盖产品内容。

## 资产库补充验收

- 参考图：`C:\Users\furong.xu\AppData\Local\Temp\codex-clipboard-17a5837e-8ca0-4618-b2a6-d1b2c6e50e6b.png`
- 验收页面：`/assets`
- 最终截图：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-assets-reference-qa-final.png`
- 叠图对照：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-assets-comparison-final.png`（上为参考图，下为本地页面）。
- 已改为三列资产浏览卡：中英标题层级、右上导入来源素材入口、图标区、资产说明、核心语流摘要、训练状态和进入资产入口均按参考结构重新排布。
- 卡片内容仍来自本地资产：没有用参考图的虚构主题、英文例句或分类替换用户导入的资产。长标题在紧凑卡片中省略显示，完整名称可通过鼠标悬停查看。
- 逐项复核了 1486 × 1057 视口下的左右边界、标题与按钮位置、三列比例、卡片高度、圆角、边框及留白。

## 今日训练主题插图验收

- 风格参考：`C:\Users\furong.xu\AppData\Local\Temp\codex-clipboard-49153a6e-33db-47da-8d9c-6d9d7468903b.png`
- 验收页面：`/`
- 最终截图：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-today-topic-images-qa.png`
- 新增的真实生成图片：`public/images/practice-swimming-relief.png`、`public/images/practice-hydration.png`、`public/images/practice-conversation.png`。
- 训练卡不再按排列顺序分配图片，而是按资产标题匹配主题：游泳、饮水、提问/对话、旅行、慢生活/专注、自助/成长分别对应相关场景，其余资产回退到已有的自然系图组。
- 已在 1486 × 1057 视口确认：天助自助者 → 林间步道、游泳减压 → 静谧泳池、放慢生活节奏 → 窗边阅读，卡片比例、圆角裁切和主题对应关系正确。

## 候选审核与资产主题图标验收

- 候选审核参考图：`C:\Users\furong.xu\AppData\Local\Temp\codex-clipboard-7d728f7b-57f4-4f20-b16b-0d4d050261be.png`
- 候选审核最终截图：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-candidate-reference-qa-final.png`
- 候选审核叠图对照：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-candidate-comparison-final.png`（上为参考图，下为本地页面）。
- 资产图标参考图：`C:\Users\furong.xu\AppData\Local\Temp\codex-clipboard-aa2e5901-4d22-4c0a-9a5c-03bed31e17f4.png`
- 资产图标最终截图：`C:\Users\furong.xu\AppData\Local\Temp\speech-asset-lab-assets-icons-qa-final.png`
- 候选审核已改为顶部静态返回栏、标题/AI 筛选入口、来源材料与候选草稿双栏、证据区内的“查看原文”，以及编辑、确认资产、忽略三项操作。AI 筛选、手动新建、段落切换、来源定位、编辑、确认和忽略仍调用原有本地功能。
- 资产库已接入统一线性图标库，并用真实资产标题与内容映射主题：追问、可信度、目的、领导力、群体对话、饮水以及后续的旅行、情感、晨间、学习、自然等主题均有不同图标；不再以同一树或叶子重复展示。
- 已复查 1486 × 1057 同视口下的双栏比例、顶部返回栏、候选操作行、标题英文字距和六张资产卡的主题图标。

final result: passed
