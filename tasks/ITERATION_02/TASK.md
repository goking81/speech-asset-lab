# Iteration 02｜Prisma 基线与本地存储目录

## 前置

Iteration 01 审核通过后，由负责人更新 `tasks/CURRENT.md` 才能开始。

## 目标

落地参考 Schema，建立空库迁移、最小 seed 和本地目录适配器。

## 必做

1. 执行并修复 `prisma format`、`prisma validate`；
2. 创建首个 SQLite 迁移；
3. 创建单本地用户和默认设置 seed；
4. 验证 AssetFlowSpan、AssetPracticeSession/Attempt、TrainingAnswer、AiTask 的关键约束；
5. 建立 data、files、logs、backups 目录和可配置根路径；
6. 防止目录穿越；
7. Repository 接口不泄漏 Prisma 类型到 UI；
8. 测试级联删除、版本不可变和重复幂等键。

## 验收

- 新机器/空目录可一条命令迁移和 seed；
- 数据库位于本地配置目录；
- 完整 API Key 不进入数据库或日志；
- Schema 中无音频、录音、转写和发音指标模型；
- 关键约束测试通过。
