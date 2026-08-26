import { PersonalizePage } from '@/features/assets/personalize-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';

export default async function PersonalizeRoute({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  if (isCloudTrialRuntime()) return <CloudTrialUnavailablePage />;

  const { assetId } = await params;
  return <PersonalizePage assetId={assetId} />;
}
