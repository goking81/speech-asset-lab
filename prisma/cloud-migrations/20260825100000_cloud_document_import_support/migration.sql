-- 云端第一阶段：私有来源原件支持 TXT、PDF、Word（.docx）。
-- 扫描 PDF 的 OCR 文本仍由服务端适配器生成，原始文件保持私有且不公开 URL。
UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
WHERE id = 'source-originals';
