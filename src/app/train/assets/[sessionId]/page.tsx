import { AssetPracticePage } from '@/features/asset-practice/asset-practice-page';

export default async function AssetPracticeRoute({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AssetPracticePage sessionId={sessionId} />;
}
