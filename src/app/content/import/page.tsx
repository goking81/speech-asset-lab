import { ImportIntakePage } from '@/features/content/import-intake-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';

export default function ContentImportPage() {
  if (isCloudTrialRuntime()) return <CloudTrialUnavailablePage />;

  return <ImportIntakePage />;
}
