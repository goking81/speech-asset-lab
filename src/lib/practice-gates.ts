export type CompletionRating = 'COMPLETE' | 'BASIC' | 'PARTIAL' | 'NOT_COMPLETED';
export type DifficultyRating = 'EASY' | 'RIGHT' | 'DIFFICULT';

export type OralAttemptGateState = {
  oralAttemptConfirmed: boolean;
  completionRating: CompletionRating | null;
  difficultyRating: DifficultyRating | null;
  isSaving: boolean;
};

export type TextAnswerGateState = {
  text: string;
  sessionVersionIsCurrent: boolean;
  isSubmitting: boolean;
};

export function canSaveOralAttempt(state: OralAttemptGateState) {
  return (
    state.oralAttemptConfirmed &&
    state.completionRating !== null &&
    state.difficultyRating !== null &&
    !state.isSaving
  );
}

export function canSubmitTextAnswer(state: TextAnswerGateState) {
  return state.text.trim().length > 0 && state.sessionVersionIsCurrent && !state.isSubmitting;
}
