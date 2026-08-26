import { CloudAdminUnavailablePage } from '@/features/cloud-trial/cloud-admin-unavailable-page';
import { CandidateReviewPage } from '@/features/content/candidate-review-page';
import { isCloudImportRuntime } from '@/lib/runtime-mode';

export default function CloudAdminReviewPage() {
  if (!isCloudImportRuntime()) return <CloudAdminUnavailablePage />;

  return (
    <CandidateReviewPage
      apiPath="/api/admin/content/candidates"
      jobId="cloud-admin"
      r1ApiPath="/api/admin/content/r1"
      workspacePath="/admin"
    />
  );
}
