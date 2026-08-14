import { expect, test } from 'vitest';

import { readZipMetadata } from './zip-metadata';

test('rejects malformed ZIP content before any extraction', () => {
  expect(() => readZipMetadata(new Uint8Array([80, 75, 3, 4]))).toThrow('ZIP_METADATA_INVALID');
});
