import { CandidateReviewPage } from '@/features/content/candidate-review-page';
import { CloudTrialUnavailablePage } from '@/features/cloud-trial/cloud-trial-unavailable-page';
import { isLocalOnlyFeatureBlocked } from '@/lib/runtime-mode';

export default async function CandidateReviewRoute({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  if (isLocalOnlyFeatureBlocked()) return <CloudTrialUnavailablePage />;

  const { jobId } = await params;

  return <CandidateReviewPage jobId={jobId} />;
}
