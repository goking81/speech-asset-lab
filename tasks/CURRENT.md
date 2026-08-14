# CURRENT

当前任务：`RC2｜私有云端发布迁移`

状态：IN PROGRESS
开始条件：RC1 本地版本已完成；GitHub 公开代码仓库、Cloudflare 账户、Supabase 新加坡生产项目和 `learnbox.cc` 主域名均已就绪。
完成条件：内置资产试用版可通过 `speechasset.learnbox.cc` 由 Cloudflare Access 安全访问；内置资产、训练状态与记录迁移至 Supabase PostgreSQL；生产环境不包含本机路径、SQLite、学习资料或明文密钥；线上不显示导入或 OCR 入口；上线回归与访问控制均通过。

当前阶段：内置资产试用版的 PostgreSQL 迁移与 Cloudflare 运行时改造。原始资料、文件导入、PDF 解析与 OCR 不属于本次线上发布范围。
