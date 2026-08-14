import { CandidateReviewPage } from '@/features/content/candidate-review-page';

export default async function CandidateReviewRoute({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return <CandidateReviewPage jobId={jobId} />;
}
