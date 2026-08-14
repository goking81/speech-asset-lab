import { AssetDetailPage } from '@/features/assets/asset-detail-page';
export default async function AssetDetailRoute({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <AssetDetailPage assetId={assetId} />;
}
