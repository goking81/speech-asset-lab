import { describe, expect, it } from 'vitest';

import { canSaveOralAttempt, canSubmitTextAnswer } from './practice-gates';

describe('canSaveOralAttempt', () => {
  const completeState = {
    oralAttemptConfirmed: true,
    completionRating: 'COMPLETE' as const,
    difficultyRating: 'RIGHT' as const,
    isSaving: false,
  };

  it('requires confirmation and both self-ratings', () => {
    expect(canSaveOralAttempt(completeState)).toBe(true);
    expect(canSaveOralAttempt({ ...completeState, oralAttemptConfirmed: false })).toBe(false);
    expect(canSaveOralAttempt({ ...completeState, completionRating: null })).toBe(false);
    expect(canSaveOralAttempt({ ...completeState, difficultyRating: null })).toBe(false);
  });

  it('disables while saving', () => {
    expect(canSaveOralAttempt({ ...completeState, isSaving: true })).toBe(false);
  });
});

describe('canSubmitTextAnswer', () => {
  const validState = { text: 'answer', sessionVersionIsCurrent: true, isSubmitting: false };

  it('accepts every trimmed non-empty answer without word or sentence gates', () => {
    expect(canSubmitTextAnswer(validState)).toBe(true);
    expect(canSubmitTextAnswer({ ...validState, text: 'word' })).toBe(true);
    expect(canSubmitTextAnswer({ ...validState, text: '字' })).toBe(true);
    expect(canSubmitTextAnswer({ ...validState, text: '。' })).toBe(true);
  });

  it('rejects blank text, stale sessions, and in-flight submissions', () => {
    expect(canSubmitTextAnswer({ ...validState, text: ' \n\t ' })).toBe(false);
    expect(canSubmitTextAnswer({ ...validState, sessionVersionIsCurrent: false })).toBe(false);
    expect(canSubmitTextAnswer({ ...validState, isSubmitting: true })).toBe(false);
  });
});
