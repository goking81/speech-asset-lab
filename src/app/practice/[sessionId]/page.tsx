import { P08PracticePage } from '@/features/training-session/p08-practice-page';

export default async function P08PracticeRoute({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <P08PracticePage sessionId={sessionId} />;
}
