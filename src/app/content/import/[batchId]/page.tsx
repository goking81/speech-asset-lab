import { ImportBatchDetailPage } from '@/features/content/import-batch-detail-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';

export default async function ImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  if (isCloudTrialRuntime()) return <CloudTrialUnavailablePage />;

  const { batchId } = await params;

  return <ImportBatchDetailPage batchId={batchId} />;
}
