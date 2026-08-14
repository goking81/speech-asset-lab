import { Suspense } from 'react';

import { QuestionPreparationPage } from '@/features/questions/question-preparation-page';

export default function PracticePreparationRoute() {
  return (
    <Suspense fallback={<PreparationLoadingState />}>
      <QuestionPreparationPage />
    </Suspense>
  );
}

function PreparationLoadingState() {
  return (
    <main className="page question-preparation">
      <p className="question-preparation__status">正在读取问题准备。</p>
    </main>
  );
}
