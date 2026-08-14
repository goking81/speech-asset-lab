import { describe, expect, it } from 'vitest';

import { MockAiProvider, AiProviderError } from './provider';
import { ReleaseBundleRegistry } from './release-bundle-registry';

const request = {
  taskId: 'task-1',
  role: 'R7A',
  text: 'word',
  releaseBundleVersion: '2026.07.25',
};

describe('MockAiProvider', () => {
  it('returns draft and insufficient-text outcomes without a real provider', async () => {
    await expect(new MockAiProvider().execute(request)).resolves.toMatchObject({ kind: 'DRAFT' });
    await expect(
      new MockAiProvider({ kind: 'INSUFFICIENT_TEXT' }).execute(request),
    ).resolves.toMatchObject({ kind: 'INSUFFICIENT_TEXT' });
  });

  it('classifies unavailable provider conditions', async () => {
    await expect(
      new MockAiProvider({ kind: 'ERROR', code: 'UNCONFIGURED' }).execute(request),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe('ReleaseBundleRegistry', () => {
  it('only exposes active frozen bundles as usable', () => {
    const registry = new ReleaseBundleRegistry();
    registry.register({ id: 'active', version: 'v1', bundleHash: 'hash-1', isActive: true });
    registry.register({ id: 'draft', version: 'v2', bundleHash: 'hash-2', isActive: false });

    expect(registry.getUsable('active')).toMatchObject({ version: 'v1' });
    expect(registry.getUsable('draft')).toBeNull();
  });
});
