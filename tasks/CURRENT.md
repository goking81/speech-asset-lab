# CURRENT

当前任务：`RC2｜私有云端发布迁移`

状态：IN PROGRESS
开始条件：RC1 本地版本已完成；GitHub 公开代码仓库、Cloudflare 账户、Supabase 新加坡生产项目和 `learnbox.cc` 主域名均已就绪。
完成条件：应用可通过 `speechasset.learnbox.cc` 由 Cloudflare Access 安全访问；业务数据迁移至 Supabase PostgreSQL，来源原件与备份放入私有 Storage；生产环境不包含本机路径、SQLite、学习资料或明文密钥；上线回归、备份恢复和访问控制均通过。

当前阶段：生产环境差异盘点与 PostgreSQL / 私有 Storage 迁移设计。此阶段不写入生产数据库，不上传学习资料，不配置真实密钥。
