import { PersonalizePage } from '@/features/assets/personalize-page';

export default async function PersonalizeRoute({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <PersonalizePage assetId={assetId} />;
}
