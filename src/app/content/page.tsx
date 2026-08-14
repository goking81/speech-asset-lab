import { ContentWorkspacePage } from '@/features/content/content-workspace-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';

export default function ContentPage() {
  if (isCloudTrialRuntime()) return <CloudTrialUnavailablePage />;

  return <ContentWorkspacePage />;
}
