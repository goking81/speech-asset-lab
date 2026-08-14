import { ImportBatchDetailPage } from '@/features/content/import-batch-detail-page';

export default async function ImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;

  return <ImportBatchDetailPage batchId={batchId} />;
}
