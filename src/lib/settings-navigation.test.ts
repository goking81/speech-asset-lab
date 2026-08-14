import { expect, test } from 'vitest';

import { settingsSections } from './settings-navigation';

test('defines six unique settings hash targets', () => {
  expect(settingsSections.map((section) => section.id)).toEqual([
    'training',
    'ai',
    'storage',
    'backup',
    'privacy',
    'experiments',
  ]);
});
