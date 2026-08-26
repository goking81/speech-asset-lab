import { CloudAdminUnavailablePage } from '@/features/cloud-trial/cloud-admin-unavailable-page';
import { ImportIntakePage } from '@/features/content/import-intake-page';
import { isCloudImportRuntime } from '@/lib/runtime-mode';

export default function CloudAdminImportPage() {
  if (!isCloudImportRuntime()) return <CloudAdminUnavailablePage />;

  return (
    <ImportIntakePage
      apiBasePath="/api/admin/imports"
      batchPath="/admin/import"
      workspacePath="/admin"
    />
  );
}
