import { expect, test } from 'vitest';

import { nearDuplicateThreshold, tokenJaccardSimilarity } from './near-duplicate';

test('detects similar text without treating unrelated text as a duplicate', () => {
  expect(
    tokenJaccardSimilarity(
      'I enjoy learning English every day at home',
      'I enjoy learning English every day at home!',
    ),
  ).toBeGreaterThanOrEqual(nearDuplicateThreshold);
  expect(
    tokenJaccardSimilarity('I enjoy learning English', 'The train leaves at noon'),
  ).toBeLessThan(nearDuplicateThreshold);
});
