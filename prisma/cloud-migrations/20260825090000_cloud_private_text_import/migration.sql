-- 云端来源原件使用私有 Supabase Storage 保存。浏览器没有任何直接对象访问策略；
-- 仅 Cloudflare Worker 内的服务端密钥可读写该 bucket。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'source-originals',
  'source-originals',
  false,
  1048576,
  ARRAY['text/plain']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 导入记录只保存对象键，不保存公开 URL。来源文档通过所属 ImportBatchFile 保持可追溯。
ALTER TABLE public."ImportBatchFile"
  ADD COLUMN IF NOT EXISTS "storageObjectKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ImportBatchFile_storageObjectKey_key"
  ON public."ImportBatchFile" ("storageObjectKey");
