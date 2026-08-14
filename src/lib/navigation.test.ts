import { expect, test } from 'vitest';

import { primaryNavigation } from './navigation';

test('defines every required primary route once', () => {
  expect(primaryNavigation.map((item) => item.href)).toEqual([
    '/',
    '/assets',
    '/practice',
    '/content',
    '/graph',
    '/history',
    '/profile',
    '/settings',
  ]);
});
