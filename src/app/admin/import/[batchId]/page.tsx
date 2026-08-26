import { CloudAdminUnavailablePage } from '@/features/cloud-trial/cloud-admin-unavailable-page';
import { ImportBatchDetailPage } from '@/features/content/import-batch-detail-page';
import { isCloudImportRuntime } from '@/lib/runtime-mode';

export default async function CloudAdminImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  if (!isCloudImportRuntime()) return <CloudAdminUnavailablePage />;

  const { batchId } = await params;
  return (
    <ImportBatchDetailPage
      apiBasePath="/api/admin/imports"
      batchId={batchId}
      importPath="/admin/import"
      r1ApiPath="/api/admin/content/r1"
      reviewPath="/admin/review"
    />
  );
}
