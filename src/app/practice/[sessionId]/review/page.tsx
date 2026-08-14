import { P09ReviewPage } from '@/features/training-session/p09-review-page';

export default async function P09ReviewRoute({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <P09ReviewPage sessionId={sessionId} />;
}
