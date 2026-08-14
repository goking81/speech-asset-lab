# 英语语流资产工具｜视觉与设计系统

版本：0.3  
更新日期：2026-07-23  
方向：沉静的资产工作台 / Calm Asset Studio

## 1. 基础方向

使用 Slate / Blue-Green，强调连续工作空间、长期阅读和资产积累。AI Coach 使用克制的 Slate-Purple，不使用机器人、聊天气泡或大面积深色卡。

## 2. 核心 Token

```css
--color-canvas: #F3F6F7;
--color-frame: #EDF1F2;
--color-surface: #FFFFFF;
--color-border: #D7E0E2;
--color-text-primary: #172126;
--color-text-secondary: #526168;
--color-primary: #2E6670;
--color-primary-hover: #285861;
--color-primary-active: #214A51;
--color-primary-soft: #E5EFF1;
--color-coach: #665F86;
--color-coach-soft: #F0EFF6;
--color-success: #3F7658;
--color-warning: #8A651E;
--color-error: #A8423D;
```

英语语流、问题和回答正文使用约 `16px / 28px`；普通 UI 14px/22px。面板 8px 圆角，控件 6px 圆角，常规内容无明显阴影。

## 3. P05 连续段落逻辑节点颜色

逻辑节点在连续英语段落中通过**文字颜色**区分。颜色表达结构，不表达成功、失败或训练状态。

| 逻辑语义 | Token | 色值 | 说明 |
|---|---|---:|---|
| 观点 / 主张 | `flow-claim` | `#245D66` | 主论点、中心思想 |
| 原因 / 解释 | `flow-reason` | `#365F84` | 因果和说明 |
| 例子 / 经历 | `flow-example` | `#7A5A18` | 具体例证 |
| 对比 / 条件 | `flow-contrast` | `#5D557D` | 转折、条件、比较 |
| 行动 / 结果 | `flow-action` | `#346A4C` | 做法、变化和结果 |
| 过渡 / 结论 / 其他 | `flow-transition` | `#5C686D` | 衔接与收束 |

这些颜色在白色表面上均以普通正文大小达到高对比度。实现要求：

- 不显示节点数字、编号徽标或彩色背景块；
- 不为每句新建独立段落；
- 节点范围使用内联 `span`，段落保持自然换行；
- Hover、Focus 或屏幕阅读器可获取节点名称；
- 页面提供紧凑图例，颜色不得成为唯一信息；
- 颜色由 `NodeType` 映射产生，不在业务数据中保存任意 Hex。

## 4. 表单与按钮状态

### 4.1 可用状态

- Primary：`color-primary` 背景、白字；
- Hover/Active 使用固定 Token；
- Focus 必须有 2px 外环；
- 禁用状态仍保持可读，并通过 `disabled` 属性和说明传达原因；
- Loading 不只变灰，显示 Spinner 和“正在保存/提交”。

### 4.2 门禁反馈

P05 自评未完成时，按钮附近显示短说明：

- “请选择本次完成情况”；
- “请选择本次难度”；
- 两项都缺失时显示合并说明。

P05/P08 空输入时可保持提交禁用；输入非空后必须立即启用，不显示词数要求。

## 5. 口头练习视觉边界

第 2—4 步使用“口头练习”文字说明和用户自报控件，不使用麦克风、声波、录音计时红点或“正在聆听”状态。普通页面计时只能表示页面时长，不能暗示语音检测。

## 6. 设置导航

设置页使用竖向子导航或 Tabs：

- 44px 以上点击高度；
- 当前项使用 `primary-soft` 背景、500 字重和左强调线；
- 键盘可达，支持 `aria-current`；
- 空状态使用中性图标、说明和下一步，不使用禁用假控件。
