import { ContentWorkspacePage } from '@/features/content/content-workspace-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isLocalOnlyFeatureBlocked } from '@/lib/runtime-mode';

export default function ContentPage() {
  if (isLocalOnlyFeatureBlocked()) return <CloudTrialUnavailablePage />;

  return <ContentWorkspacePage />;
}
