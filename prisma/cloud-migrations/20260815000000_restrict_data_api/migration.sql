-- 内置资产试用版仅允许 Worker 使用私密数据库连接访问。
-- 禁止 Supabase Data API 的 anon/authenticated 角色直接读取任何业务表。
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'spatial_ref_sys'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', target.tablename);
  END LOOP;

  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
END $$;
