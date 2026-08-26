import { CloudAdminUnavailablePage } from '@/features/cloud-trial/cloud-admin-unavailable-page';
import { ContentWorkspacePage } from '@/features/content/content-workspace-page';
import { isCloudImportRuntime } from '@/lib/runtime-mode';

export default function CloudAdminPage() {
  if (!isCloudImportRuntime()) return <CloudAdminUnavailablePage />;

  return (
    <ContentWorkspacePage
      cloudAdmin
      importPath="/admin/import"
      reviewPath="/admin/review"
    />
  );
}
