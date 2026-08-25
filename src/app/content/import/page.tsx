import { ImportIntakePage } from '@/features/content/import-intake-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isLocalOnlyFeatureBlocked } from '@/lib/runtime-mode';

export default function ContentImportPage() {
  if (isLocalOnlyFeatureBlocked()) return <CloudTrialUnavailablePage />;

  return <ImportIntakePage />;
}
